import { TradeExecutorAbi } from "@/abis/TradeExecutorAbi";
import { config as wagmiConfig, OPTIMISM_TRANSPORT } from "@/config/wagmi";
import { Execution } from "@/hooks/useCheck7702Support";
import { BatchTxResult, CallBatchesInput, TxProgress, TxStateChange } from "@/types";
import { CHAIN_ID, OPTIMISM_MAX_TX_GAS } from "@/utils/constants";
import { getErrorHeadline, TradeError } from "@/utils/errors";
import {
  Config,
  ConnectorNotConnectedError,
  SendCallsReturnType,
  estimateFeesPerGas,
  getCallsStatus,
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
} from "viem";
import { optimism } from "viem/chains";
import { CheckCircleIcon, CloseCircleIcon, LoadingIcon } from "./icons";
import { authorizeSessionKey, fundSessionKey } from "./on-chain/sessionKey";

export const DEFAULT_TOAST_OPTIONS = {
  position: "bottom-right" as ToastPosition,
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
      // Set when the transaction was broadcast but we lost track of it (e.g. receipt timeout).
      // Resending in that case would execute the same calls twice, so callers must not retry.
      hash?: `0x${string}`;
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

/**
 * One toast for a whole multi-batch run, updated in place.
 *
 * The batch loops used to fire an info toast and a success toast per batch, so
 * a twelve-batch run stacked twenty-four notifications over the dialog that
 * was already reporting the same thing.
 */
export function createRunToast(title: string, subtitle = "") {
  const id = toast.info(toastContent(title, subtitle), {
    ...DEFAULT_TOAST_OPTIONS,
    autoClose: false,
    closeOnClick: false,
    icon: <LoadingIcon />,
  });

  return {
    update(nextTitle: string, nextSubtitle = "") {
      toast.update(id, { render: toastContent(nextTitle, nextSubtitle) });
    },
    succeed(nextTitle: string, nextSubtitle = "") {
      toast.update(id, {
        render: toastContent(nextTitle, nextSubtitle),
        type: "success",
        icon: <CheckCircleIcon width={16} height={16} />,
        autoClose: 5000,
        closeOnClick: true,
      });
    },
    fail(nextTitle: string, nextSubtitle = "") {
      toast.update(id, {
        render: toastContent(nextTitle, nextSubtitle),
        type: "error",
        icon: <CloseCircleIcon />,
        autoClose: 8000,
        closeOnClick: true,
      });
    },
    dismiss() {
      toast.dismiss(id);
    },
  };
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
    toastError({ title: getErrorMessage(error) });

    return { status: false, error };
  }
};

/**
 * A mined transaction is not a successful one.
 *
 * `waitForTransactionReceipt` resolves for a *reverted* transaction exactly as it does for a
 * successful one — the outcome lives in `receipt.status`, and nothing here used to read it. Every
 * batch is simulated before it is sent, so a revert is rare; the window it comes through is the gap
 * between simulation and inclusion, where a price moves and a swap reverts. Such a run reported
 * "Strategy executed" and left the user looking for trades that never happened.
 *
 * A `batchExecute` is one transaction, so a revert undoes the whole batch: nothing was applied.
 */
const settleReceipt = (receipt: TransactionReceipt): ToastifyTxReturn =>
  receipt.status === "success"
    ? { status: true, receipt }
    : {
        status: false,
        error: new TradeError(
          "The transaction reverted on chain.",
          "Nothing in the run was applied. Reopen the dialog so fresh quotes are fetched, then execute again.",
        ),
        hash: receipt.transactionHash,
      };

export const handleTx: ToastifyTxFn = async (contractWrite) => {
  let hash: `0x${string}` | undefined = undefined;
  // Set as soon as the wallet accepts an EIP-5792 batch, and the reason the recovery below can work
  // without a hash: once there is an id the calls are on their way, whatever the wait then threw.
  let callsId: string | undefined = undefined;
  const TIMEOUT = 30000;
  try {
    const result = await contractWrite();

    if (typeof result === "string") {
      hash = result;
    } else {
      callsId = result.id;
      const { receipts = [] } = await waitForCallsStatus(wagmiConfig, {
        id: result.id,
        timeout: TIMEOUT, //x seconds timeout, then we poll manually
      });

      hash = receipts[0]?.transactionHash;
      if (!hash) {
        throw new Error("No transaction hash found in call results");
      }
    }

    const receipt = await waitForTransactionReceipt(wagmiConfig, {
      hash,
      confirmations: 0,
      timeout: TIMEOUT, //x seconds timeout, then we poll manually
    });

    return settleReceipt(receipt);
    // biome-ignore lint/suspicious/noExplicitAny:
  } catch (error: any) {
    // The batch reached the wallet but no answer came back at the bundle level — a slow
    // `wallet_getCallsStatus`, or a wallet that acknowledges the bundle before it has receipts for
    // it. The calls are in flight either way, so ask again for the hash instead of calling this a
    // failure: a failure reported here is what makes a user re-run a strategy that already executed.
    if (!hash && callsId) {
      hash = await pollForCallsHash(callsId);
    }

    // timeout so we poll manually
    if (
      hash &&
      (error instanceof WaitForTransactionReceiptTimeoutError ||
        error instanceof TransactionNotFoundError ||
        error instanceof TransactionReceiptNotFoundError ||
        error?.message?.toLowerCase()?.includes("timed out") ||
        // Reached via the recovery above, where the error is whatever the bundle wait threw.
        !!callsId)
    ) {
      const newReceipt = await pollForTransactionReceipt(hash);
      if (newReceipt) {
        return settleReceipt(newReceipt);
      }
    }

    return { status: false, error, hash };
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

  const runToast = createRunToast(
    config?.txSent?.title || "Sending transaction…",
    batches.length > 1
      ? `Your wallet signs ${batches.length} batches for this run.`
      : (config?.txSent?.subtitle ?? ""),
  );

  let lastReceipt: TransactionReceipt | undefined;

  // No batches means the loop below never runs; without this the spinner toast never resolves.
  if (!batches.length) {
    runToast.dismiss();
    return { status: true, receipt: lastReceipt! };
  }

  // Process each batch sequentially
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const isLastBatch = i === batches.length - 1;

    if (batches.length > 1) {
      runToast.update(
        config?.txSent?.title || "Sending transaction…",
        `Batch ${i + 1} of ${batches.length}`,
      );
    }

    const result = await handleTx(() => sendCalls(wagmiConfig, { calls: batch }));

    if (!result.status) {
      runToast.fail(
        config?.txError?.title || "Transaction failed",
        getErrorMessage(result.error),
      );
      return result;
    }

    if (isLastBatch) {
      runToast.succeed(config?.txSuccess?.title || "Transaction sent");
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

  const runToast = createRunToast(
    messageConfig.txSent,
    batches.length > 1 ? `Your wallet signs ${batches.length} batches for this run.` : "",
  );

  let lastReceipt: TransactionReceipt | undefined;

  // No batches means the loop below never runs; without this the spinner toast never resolves.
  if (!batches.length) {
    runToast.dismiss();
    return { status: true, receipt: lastReceipt! };
  }

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
        gas: OPTIMISM_MAX_TX_GAS,
      });
    } catch (err) {
      runToast.fail("Transaction failed", getErrorMessage(err));
      return {
        status: false,
        error: err,
      };
    }
    if (batches.length > 1) {
      runToast.update(messageConfig.txSent, `Batch ${i + 1} of ${batches.length}`);
    }
    const writePromise = writeContract(wagmiConfig, {
      address: tradeExecutor,
      abi: TradeExecutorAbi,
      functionName: "batchExecute",
      args: [batch.map((call) => ({ data: call.data, to: call.to }))],
      value: 0n,
      chainId: CHAIN_ID,
    });
    const result = await handleTx(() => writePromise);
    if (!result.status) {
      runToast.fail("Transaction failed", getErrorMessage(result.error));
      return { status: false, error: result.error };
    }
    if (isLastBatch) {
      runToast.succeed(messageConfig.txSuccess);
    }

    lastReceipt = result.receipt;
  }

  return { status: true, receipt: lastReceipt! };
};

async function buildExecutableBatch(
  calls: Execution[],
  simulateBatch: (calls: Execution[]) => Promise<any>,
): Promise<{ good: Execution[]; bad: Execution[] }> {
  const good: Execution[] = [];
  const bad: Execution[] = [];

  for (const call of calls) {
    try {
      await simulateBatch([...good, call]);
      good.push(call);
    } catch {
      bad.push(call);
    }
  }

  return { good, bad };
}

const SEND_ATTEMPTS = 3;
const INSUFFICIENT_GAS_FUNDS =
  "The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.";

export const toastifyBatchTxSessionKey = async (
  tradeExecutor: Address,
  input: CallBatchesInput,
  onStateChange: TxStateChange,
  gasPerBatch = 10_000_000n,
): Promise<BatchTxResult> => {
  const sessionAccount = await authorizeSessionKey(tradeExecutor, onStateChange);

  // Same transport the simulations run through — a batch that simulates on drpc must not be
  // broadcast to a different, rate-limited endpoint.
  const sessionWallet = createWalletClient({
    account: sessionAccount,
    chain: optimism,
    transport: OPTIMISM_TRANSPORT,
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
      gas: OPTIMISM_MAX_TX_GAS,
    });

    return request;
  };

  // Returns null when there is nothing executable left in the batch. Callers must not broadcast
  // in that case — simulating an empty call array would "succeed" and burn gas on a no-op tx that
  // reports success while having done nothing.
  type SimulatedRequest = Awaited<ReturnType<typeof simulateBatchExecute>>;

  const executeBatch = async (
    calls: Execution[],
    skipFailCalls?: boolean,
  ): Promise<{ request: SimulatedRequest; executed: number; pruned: number } | null> => {
    try {
      return { request: await simulateBatchExecute(calls), executed: calls.length, pruned: 0 };
    } catch (err: any) {
      if (!skipFailCalls) {
        console.log("not skip calls ", calls.length, err.message);
        throw err;
      }

      const { good } = await buildExecutableBatch(calls, simulateBatchExecute);
      console.log("keep good calls ", good.length, "of", calls.length);
      if (!good.length) {
        return null;
      }
      try {
        return {
          request: await simulateBatchExecute(good),
          executed: good.length,
          pruned: calls.length - good.length,
        };
      } catch (err2: any) {
        console.log("final batch still failed", err2.message);
        return null;
      }
    }
  };

  // A batch that simulated fine but failed to broadcast is a transport problem, not a bad call.
  // Retry it before giving up — and never swallow the failure, regardless of skipFailCalls.
  const sendBatch = async (request: SimulatedRequest, progress: TxProgress) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        onStateChange({
          ...progress,
          label: `${progress.label} — retrying (${attempt}/${SEND_ATTEMPTS - 1})`,
        });
      }
      const result = await handleTx(() => sessionWallet.writeContract(request));
      if (result.status) {
        return result.receipt;
      }
      lastError = result.error;

      // The batch was broadcast but we couldn't confirm it. Resending would run the same calls a
      // second time, so stop here and let the caller surface it.
      if (result.hash) {
        break;
      }

      if (result.error?.message?.includes(INSUFFICIENT_GAS_FUNDS)) {
        await fundSessionKey(50_000_000n * maxFeePerGas, onStateChange);
        onStateChange(progress);
        continue;
      }
      if (attempt < SEND_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
    throw lastError;
  };

  let executedCalls = 0;
  let prunedCalls = 0;
  let skippedBatches = 0;

  try {
    for (let i = 0; i < input.length; i++) {
      const { calls, message, skipFailCalls, phase, step, of } = input[i];
      const progress: TxProgress = {
        phase: phase ?? "work",
        label: message ?? `Executing batch ${i + 1}`,
        step,
        of,
      };

      // Nothing to do — don't pay for an empty batchExecute([]).
      if (!calls.length) {
        continue;
      }

      onStateChange(progress);

      const batch = await executeBatch(calls as Execution[], skipFailCalls);

      if (!batch) {
        // Every call in this batch reverted during simulation.
        prunedCalls += calls.length;
        skippedBatches++;
        continue;
      }

      lastReceipt = await sendBatch(batch.request, progress);
      executedCalls += batch.executed;
      prunedCalls += batch.pruned;
    }
  } catch (error: any) {
    return { status: false, error };
  }
  return { status: true, receipt: lastReceipt, executedCalls, prunedCalls, skippedBatches };
};

// Owner-signed counterpart to toastifyBatchTxSessionKey, for trade executors that don't
// support a session key (e.g. the deprecated OldTradeExecutor, which is onlyOwner-gated).
// Submits each pre-built batch as a separate owner-signed batchExecute call, so unlike the
// session key path the connected wallet is prompted once per batch.
export const toastifyBatchTxOwner = async (
  tradeExecutor: Address,
  input: CallBatchesInput,
  onStateChange: TxStateChange,
): Promise<BatchTxResult> => {
  let lastReceipt: TransactionReceipt | undefined;
  let executedCalls = 0;
  let prunedCalls = 0;
  let skippedBatches = 0;

  const buildBatchArgs = (calls: CallBatchesInput[number]["calls"]) =>
    calls.map(({ to, data }) => ({ to, data }));

  try {
    for (let i = 0; i < input.length; i++) {
      const { calls, message, skipFailCalls, phase, step, of } = input[i];

      // Nothing to do — don't pay for an empty batchExecute([]).
      if (!calls.length) {
        continue;
      }

      onStateChange({
        phase: phase ?? "work",
        label: message ?? `Executing batch ${i + 1}`,
        step,
        of,
      });

      let executableCalls = calls;
      try {
        await simulateContract(wagmiConfig, {
          address: tradeExecutor,
          abi: TradeExecutorAbi,
          functionName: "batchExecute",
          args: [buildBatchArgs(calls)],
          chainId: CHAIN_ID,
          gas: OPTIMISM_MAX_TX_GAS,
        });
      } catch (err) {
        if (!skipFailCalls) {
          throw err;
        }
        const { good } = await buildExecutableBatch(calls as Execution[], (goodCalls) =>
          simulateContract(wagmiConfig, {
            address: tradeExecutor,
            abi: TradeExecutorAbi,
            functionName: "batchExecute",
            args: [buildBatchArgs(goodCalls)],
            chainId: CHAIN_ID,
            gas: OPTIMISM_MAX_TX_GAS,
          }),
        );
        executableCalls = good;
      }

      if (executableCalls.length === 0) {
        // Every call reverted during simulation.
        prunedCalls += calls.length;
        skippedBatches++;
        continue;
      }

      const writePromise = writeContract(wagmiConfig, {
        address: tradeExecutor,
        abi: TradeExecutorAbi,
        functionName: "batchExecute",
        args: [buildBatchArgs(executableCalls)],
        value: 0n,
        chainId: CHAIN_ID,
      });

      const result = await toastifyTx(() => writePromise, {
        txSent: { title: message ?? `Sending batch ${i + 1}/${input.length}...` },
        txSuccess: {
          title: i === input.length - 1 ? "Done!" : `Batch ${i + 1}/${input.length} sent!`,
        },
      });

      // A send that failed is never swallowed: skipFailCalls governs call pruning, not transport.
      if (!result.status) {
        throw result.error;
      }

      lastReceipt = result.receipt;
      executedCalls += executableCalls.length;
      prunedCalls += calls.length - executableCalls.length;
    }
  } catch (error: any) {
    return { status: false, error };
  }
  return { status: true, receipt: lastReceipt, executedCalls, prunedCalls, skippedBatches };
};

/** Shared by both pollers: ~64s of backoff, jittered to prevent synchronized retries. */
const backoff = (attempt: number, initialInterval: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, initialInterval * 2 ** attempt + Math.round(Math.random() * 1000)),
  );

/**
 * The transaction hash behind an EIP-5792 batch, asked for until the wallet has one.
 *
 * `waitForCallsStatus` gives up at its timeout, and a batch only just broadcast has no receipts to
 * report yet — MetaMask routes these through `redeemDelegations`, an ordinary transaction that
 * takes ordinary inclusion time. Without this the run is reported as failed while its trades land
 * anyway, and the natural response to that — run it again — executes the whole strategy twice.
 */
async function pollForCallsHash(id: string, maxAttempts = 7, initialInterval = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { receipts } = await getCallsStatus(wagmiConfig, { id });
      const hash = receipts?.[0]?.transactionHash;
      if (hash) {
        return hash;
      }
    } catch (e) {
      console.warn(`Failed to get calls status for ${id}, attempt ${i + 1}:`, e);
    }
    await backoff(i, initialInterval);
  }

  return undefined;
}

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
    await backoff(i, initialInterval);
  }

  return null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ConnectorNotConnectedError) {
    return "Connect your wallet to continue.";
  }

  return getErrorHeadline(error);
}
