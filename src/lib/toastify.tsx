import { TradeExecutorAbi } from "@/abis/TradeExecutorAbi";
import { config as wagmiConfig } from "@/config/wagmi";
import { Execution } from "@/hooks/useCheck7702Support";
import { CallBatchesInput } from "@/types";
import { CHAIN_ID } from "@/utils/constants";
import {
  Config,
  ConnectorNotConnectedError,
  SendCallsReturnType,
  estimateFeesPerGas,
  getTransactionReceipt,
  sendCalls,
  simulateContract,
  waitForCallsStatus,
  waitForTransactionReceipt,
  writeContract,
} from "@wagmi/core";
import { Theme, ToastOptions, ToastPosition, toast } from "react-toastify";
import {
  Address,
  TransactionNotFoundError,
  TransactionReceipt,
  TransactionReceiptNotFoundError,
  WaitForTransactionReceiptTimeoutError,
  createWalletClient,
  http,
} from "viem";
import { optimism } from "viem/chains";
import { CheckCircleIcon, CloseCircleIcon, LoadingIcon } from "./icons";
import { authorizeSessionKey, fundSessionKey } from "./on-chain/sessionKey";

export const DEFAULT_TOAST_OPTIONS = {
  position: "top-center" as ToastPosition,
  autoClose: 5000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
  theme: "light" as Theme,
};

type ToastifyReturn<T> =
  | {
      status: true;
      data: T;
    }
  | {
      status: false;
      error: Error;
    };

type ToastifyTxReturn =
  | {
      status: true;
      receipt: TransactionReceipt;
    }
  | {
      status: false;
      error: Error;
    };

type ToastifyConfig = {
  txSent?: {
    title: string;
    subtitle?: string;
  };
  txSuccess?: {
    title: string;
    subtitle?: string;
  };
  txError?: {
    title: string;
    subtitle?: string;
  };
  options?: ToastOptions;
};

type ToastifyFn<T> = (
  execute: () => Promise<T>,
  config?: ToastifyConfig,
) => Promise<ToastifyReturn<T>>;

type ToastifyTxFn = (
  contractWrite: () => Promise<`0x${string}` | SendCallsReturnType>,
  config?: ToastifyConfig,
) => Promise<ToastifyTxReturn>;

type ToastifySendCalls = (
  calls: Execution[],
  wagmiConfig: Config,
  config?: ToastifyConfig,
) => Promise<ToastifyTxReturn>;

interface ToastContentType {
  title: string;
  subtitle?: string;
  options?: ToastOptions;
}

function toastContent(title: string, subtitle: string) {
  return (
    <div>
      <div className="text-[16px] font-semibold">{title}</div>
      {subtitle && <div className="text-[14px] font-normal">{subtitle}</div>}
    </div>
  );
}

export function toastInfo({ title, subtitle = "", options }: ToastContentType) {
  toast.info(toastContent(title, subtitle), {
    ...{ ...DEFAULT_TOAST_OPTIONS, ...options },
    icon: <LoadingIcon />,
  });
}

export function toastSuccess({ title, subtitle = "", options }: ToastContentType) {
  toast.success(toastContent(title, subtitle), {
    ...{ ...DEFAULT_TOAST_OPTIONS, ...options },
    icon: <CheckCircleIcon width={32} height={32} />,
  });
}

export function toastError({ title, subtitle = "", options }: ToastContentType) {
  toast.error(toastContent(title, subtitle), {
    ...{ ...DEFAULT_TOAST_OPTIONS, ...options },
    icon: <CloseCircleIcon />,
  });
}

// biome-ignore lint/suspicious/noExplicitAny:
export const toastify: ToastifyFn<any> = async (execute, config) => {
  toastInfo({
    title: config?.txSent?.title || "Sending transaction...",
    subtitle: config?.txSent?.subtitle,
  });

  try {
    const result = await execute();

    toastSuccess({
      title: config?.txSuccess?.title || "Transaction sent!",
      subtitle: config?.txSent?.subtitle,
    });

    return { status: true, data: result };
    // biome-ignore lint/suspicious/noExplicitAny:
  } catch (error: any) {
    toastError({
      title: error.reason ?? error.shortMessage ?? error.body?.description ?? error.message,
    });

    return { status: false, error };
  }
};

export const handleTx: ToastifyTxFn = async (contractWrite) => {
  let hash: `0x${string}` | undefined = undefined;
  const TIMEOUT = 30000;
  try {
    const result = await contractWrite();

    let receipt: TransactionReceipt;
    if (typeof result === "string") {
      hash = result;

      receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash,
        confirmations: 0,
        timeout: TIMEOUT, //x seconds timeout, then we poll manually
      });
    } else {
      const { receipts = [] } = await waitForCallsStatus(wagmiConfig, {
        id: result.id,
        timeout: TIMEOUT,
      });

      if (!receipts.length || !receipts[0].transactionHash) {
        throw new Error("No transaction hash found in call results");
      }

      hash = receipts[0].transactionHash;

      receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash,
        confirmations: 0,
        timeout: TIMEOUT, //x seconds timeout, then we poll manually
      });
    }

    return { status: true, receipt: receipt };
    // biome-ignore lint/suspicious/noExplicitAny:
  } catch (error: any) {
    // timeout so we poll manually
    if (
      hash &&
      (error instanceof WaitForTransactionReceiptTimeoutError ||
        error instanceof TransactionNotFoundError ||
        error instanceof TransactionReceiptNotFoundError ||
        error?.message?.toLowerCase()?.includes("timed out"))
    ) {
      const newReceipt = await pollForTransactionReceipt(hash);
      if (newReceipt) {
        return { status: true, receipt: newReceipt };
      }
    }

    return { status: false, error };
  }
};

export const toastifyTx: ToastifyTxFn = async (contractWrite, config) => {
  toastInfo({
    title: config?.txSent?.title || "Sending transaction...",
    subtitle: config?.txSent?.subtitle,
  });
  const result = await handleTx(contractWrite);
  if (result.status) {
    toastSuccess({
      title: config?.txSuccess?.title || "Transaction sent!",
      subtitle: config?.txSent?.subtitle,
    });
  } else {
    toastError({ title: getErrorMessage(result.error), subtitle: config?.txSent?.subtitle });
  }
  return result;
};

export const toastifySendCallsTx: ToastifySendCalls = async (calls, wagmiConfig, config) => {
  const BATCH_SIZE = 10;
  const batches = [];

  // Split calls into batches of 10
  for (let i = 0; i < calls.length; i += BATCH_SIZE) {
    batches.push(calls.slice(i, i + BATCH_SIZE));
  }

  const isSingleBatch = batches.length === 1;

  // Show initial info about batching
  if (!isSingleBatch) {
    toastInfo({
      title: "Processing multiple batches",
      subtitle: `Due to wallet limitations, ${calls.length} calls will be processed in ${batches.length} batches of up to ${BATCH_SIZE} calls each.`,
      options: { autoClose: 8000 },
    });
  }

  let lastReceipt: TransactionReceipt | undefined;

  // Process each batch sequentially
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const isLastBatch = i === batches.length - 1;

    const result = await toastifyTx(
      () => sendCalls(wagmiConfig, { calls: batch }),
      isSingleBatch
        ? config
        : {
            txSent: {
              title: config?.txSent?.title || `Sending batch ${i + 1}/${batches.length}...`,
              subtitle: config?.txSent?.subtitle,
            },
            txSuccess: {
              title: isLastBatch
                ? config?.txSuccess?.title || "All transactions sent!"
                : `Batch ${i + 1}/${batches.length} sent!`,
              subtitle: config?.txSuccess?.subtitle,
            },
            txError: {
              title: config?.txError?.title || `Failed to send batch ${i + 1}/${batches.length}`,
              subtitle: config?.txError?.subtitle,
            },
            options: config?.options,
          },
    );

    // If any batch fails, abort the entire process and return the error
    if (!result.status) {
      return result;
    }

    lastReceipt = result.receipt;
  }

  return { status: true, receipt: lastReceipt! };
};

export const toastifyBatchTx = async (
  tradeExecutor: Address,
  calls: {
    to: `0x${string}`;
    value?: bigint;
    data: `0x${string}`;
  }[],
  messageConfig: { txSent: string; txSuccess: string },
  batchSize?: number,
) => {
  //static call first
  try {
    await simulateContract(wagmiConfig, {
      address: tradeExecutor,
      abi: TradeExecutorAbi,
      functionName: "batchExecute",
      args: [
        calls.map((call) => ({
          to: call.to,
          data: call.data,
        })),
      ],
      value: 0n,
      chainId: CHAIN_ID,
    });
  } catch (err) {
    return {
      status: false,
      error: err,
    };
  }

  const BATCH_SIZE = batchSize || 50;
  const batches = [];

  for (let i = 0; i < calls.length; i += BATCH_SIZE) {
    batches.push(calls.slice(i, i + BATCH_SIZE));
  }

  const isSingleBatch = batches.length === 1;
  // Show initial info about batching
  if (!isSingleBatch) {
    toastInfo({
      title: "Processing multiple batches",
      subtitle: `Due to wallet limitations, ${calls.length} calls will be processed in ${batches.length} batches of up to ${BATCH_SIZE} calls each.`,
      options: { autoClose: 8000 },
    });
  }

  let lastReceipt: TransactionReceipt | undefined;

  // Process each batch sequentially
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const isLastBatch = i === batches.length - 1;
    //static call each batch with gas limit first
    try {
      await simulateContract(wagmiConfig, {
        address: tradeExecutor,
        abi: TradeExecutorAbi,
        functionName: "batchExecute",
        args: [
          batch.map((call) => ({
            to: call.to,
            data: call.data,
          })),
        ],
        value: 0n,
        chainId: CHAIN_ID,
        gas: 20_000_000n,
      });
    } catch (err) {
      return {
        status: false,
        error: err,
      };
    }
    const writePromise = writeContract(wagmiConfig, {
      address: tradeExecutor,
      abi: TradeExecutorAbi,
      functionName: "batchExecute",
      args: [batch.map((call) => ({ data: call.data, to: call.to }))],
      value: 0n,
      chainId: CHAIN_ID,
    });
    const result = await toastifyTx(() => writePromise, {
      txSent: {
        title: isSingleBatch ? messageConfig.txSent : `Sending batch ${i + 1}/${batches.length}...`,
      },
      txSuccess: {
        title: isLastBatch ? messageConfig.txSuccess : `Batch ${i + 1}/${batches.length} sent!`,
      },
    });
    if (!result.status) {
      return { status: false, error: result.error };
    }

    lastReceipt = result.receipt;
  }

  return { status: true, receipt: lastReceipt! };
};

async function splitAndFilter(
  calls: Execution[],
  simulateBatch: (calls: Execution[]) => Promise<any>,
  good: Execution[] = [],
  bad: Execution[] = [],
): Promise<{ good: Execution[]; bad: Execution[] }> {
  if (!calls.length) return { good, bad };

  if (calls.length === 1) {
    try {
      await simulateBatch(calls);
      good.push(calls[0]);
    } catch {
      bad.push(calls[0]);
    }
    return { good, bad };
  }

  try {
    await simulateBatch(calls);
    good.push(...calls);
    return { good, bad };
  } catch {
    const mid = Math.floor(calls.length / 2);
    const left = calls.slice(0, mid);
    const right = calls.slice(mid);

    await splitAndFilter(left, simulateBatch, good, bad);
    await splitAndFilter(right, simulateBatch, good, bad);
    return { good, bad };
  }
}

export const toastifyBatchTxSessionKey = async (
  tradeExecutor: Address,
  input: CallBatchesInput,
  onStateChange: (state: string) => void,
  gasPerBatch = 10_000_000n,
) => {
  const sessionAccount = await authorizeSessionKey(tradeExecutor, onStateChange);

  const sessionWallet = createWalletClient({
    account: sessionAccount,
    chain: optimism,
    transport: http(),
  });

  const { maxFeePerGas } = await estimateFeesPerGas(wagmiConfig, { chainId: CHAIN_ID });
  const maxGasCost = gasPerBatch * BigInt(input.length) * maxFeePerGas;

  await fundSessionKey(maxGasCost, onStateChange);

  let lastReceipt: TransactionReceipt | undefined;

  const buildBatchArgs = (calls: Execution[]) => calls.map(({ to, data }) => ({ to, data }));

  const simulateBatchExecute = async (calls: Execution[]) => {
    const { request } = await simulateContract(wagmiConfig, {
      address: tradeExecutor,
      abi: TradeExecutorAbi,
      functionName: "batchExecute",
      args: [buildBatchArgs(calls)],
      account: sessionAccount,
      chainId: CHAIN_ID,
      gas: 20_000_000n,
    });

    return request;
  };

  const executeBatch = async (calls: Execution[], skipFailCalls?: boolean) => {
    try {
      return await simulateBatchExecute(calls);
    } catch (err: any) {
      if (!skipFailCalls) {
        console.log("not skip calls ", calls.length, err.message);
        throw err;
      }

      const { good } = await splitAndFilter(calls, simulateBatchExecute);
      console.log("keep good calls ", good.length);
      return await simulateBatchExecute(good);
    }
  };

  try {
    for (let i = 0; i < input.length; i++) {
      const { calls, message, skipFailCalls } = input[i];

      onStateChange(message ?? `Executing batch ${i + 1}`);

      const request = await executeBatch(calls as Execution[], skipFailCalls);

      const result = await handleTx(() => sessionWallet.writeContract(request));

      if (!result.status) {
        if (
          result.error.message.includes(
            "The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.",
          )
        ) {
          await fundSessionKey(30_000_000n * maxFeePerGas, onStateChange);
          onStateChange(message ?? `Executing batch ${i + 1}`);
          const newResult = await handleTx(() => sessionWallet.writeContract(request));
          if (!newResult.status) {
            throw newResult.error;
          }
          lastReceipt = newResult.receipt;
          continue;
        }
        if (skipFailCalls) {
          continue;
        }
        throw result.error;
      }

      lastReceipt = result.receipt;
    }
  } catch (error: any) {
    return { status: false, error };
  }
  return { status: true, receipt: lastReceipt! };
};

async function pollForTransactionReceipt(
  hash: `0x${string}`,
  maxAttempts = 7,
  initialInterval = 500,
) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const txReceipt = await getTransactionReceipt(wagmiConfig, { hash });
      if (txReceipt?.blockNumber) {
        return txReceipt;
      }
    } catch (e) {
      console.warn(`Failed to get transaction receipt for ${hash}, attempt ${i + 1}:`, e);
    }
    const backoffTime = initialInterval * 2 ** i;
    const jitter = Math.round(Math.random() * 1000); // Add some randomness to prevent synchronized retries
    await new Promise((resolve) => setTimeout(resolve, backoffTime + jitter));
  }

  return null;
}

// biome-ignore lint/suspicious/noExplicitAny:
function getErrorMessage(error: any): string {
  if (error instanceof ConnectorNotConnectedError) {
    return "Please connect your wallet.";
  }

  return error.shortMessage ?? error.message;
}
