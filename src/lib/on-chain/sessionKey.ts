import { TradeExecutorAbi } from "@/abis/TradeExecutorAbi";
import { config } from "@/config/wagmi";
import { isTwoStringsEqual } from "@/utils/common";
import {
  estimateFeesPerGas,
  getAccount,
  getBalance,
  readContract,
  sendTransaction,
  writeContract,
} from "@wagmi/core";
import { Address, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { handleTx } from "../toastify";
import { CHAIN_ID } from "@/utils/constants";
import { optimism } from "viem/chains";

class SessionKeyManager {
  private static STORAGE_KEY = "trade_executor_session_key";

  static create(): `0x${string}` {
    const sessionKey = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}` as `0x${string}`;

    // Ephemeral - cleared when browser closes
    sessionStorage.setItem(this.STORAGE_KEY, sessionKey);
    return sessionKey;
  }

  static get(): `0x${string}` | null {
    return sessionStorage.getItem(this.STORAGE_KEY) as `0x${string}` | null;
  }

  static clear() {
    sessionStorage.removeItem(this.STORAGE_KEY);
  }

  static getOrCreate(): `0x${string}` {
    return this.get() || this.create();
  }
}

export const getSessionAccount = (onStateChange: (state: string) => void) => {
  let sessionPrivateKey = SessionKeyManager.get();
  let sessionAccount = sessionPrivateKey ? privateKeyToAccount(sessionPrivateKey) : null;

  // Create new session key if doesn't exist
  if (!sessionPrivateKey) {
    sessionPrivateKey = SessionKeyManager.create();
    sessionAccount = privateKeyToAccount(sessionPrivateKey);
    onStateChange(
      `Session key created: ${sessionAccount.address.slice(0, 6)}...${sessionAccount.address.slice(
        -4,
      )}`,
    );
  }

  return sessionAccount!;
};

export const fundSessionKey = async (gasCost: bigint, onStateChange: (state: string) => void) => {
  const sessionAccount = getSessionAccount(onStateChange);
  // Check if session key exists and has sufficient balance
  const data = await getBalance(config, {
    address: sessionAccount.address,
  });
  const balance = data.value;
  if (balance >= gasCost) {
    return sessionAccount;
  }

  // Prompt user to fund
  onStateChange("Funding session key...");
  const result = await handleTx(() =>
    sendTransaction(config, {
      to: sessionAccount!.address,
      value: gasCost - balance,
    }),
  );

  if (!result.status) {
    SessionKeyManager.clear();
    throw new Error("Failed to fund session key");
  }

  return sessionAccount!;
};

export const withdrawFundSessionKey = async () => {
  try {
    const sessionAccount = getSessionAccount(() => {});
    const data = await getBalance(config, {
      address: sessionAccount.address,
    });
    const balance = data.value;
    const { maxFeePerGas } = await estimateFeesPerGas(config, { chainId: CHAIN_ID });
    const sendTxGasCost = 30_000n * maxFeePerGas;
    if (balance > sendTxGasCost) {
      const sessionWallet = createWalletClient({
        account: sessionAccount,
        chain: optimism,
        transport: http(),
      });
      await handleTx(() =>
        sessionWallet.sendTransaction({
          to: getAccount(config).address,
          value: balance - sendTxGasCost,
        }),
      );
    }
  } catch (e) {
    console.log("Cannot refund session key ", e);
  }
};

export const authorizeSessionKey = async (
  tradeExecutor: Address,
  onStateChange: (state: string) => void,
) => {
  const sessionAccount = getSessionAccount(onStateChange);
  // Set session key in contract
  const [currentSessionKey, currentExpiry] = await Promise.all([
    readContract(config, {
      address: tradeExecutor,
      abi: TradeExecutorAbi,
      functionName: "permitted",
    }),
    readContract(config, {
      address: tradeExecutor,
      abi: TradeExecutorAbi,
      functionName: "expire",
    }),
  ]);
  // make sure the permission is at least 30 minutes from now
  const atLeastFromNow = Number(currentExpiry) > Math.floor(new Date().getTime() / 1000) + 60 * 30;
  const isPermitted =
    isTwoStringsEqual(currentSessionKey as Address, sessionAccount.address) && atLeastFromNow;
  if (!isPermitted) {
    const expiry = Math.floor(new Date().getTime() / 1000) + 60 * 60;
    onStateChange("Authorizing session key...");
    const result = await handleTx(() =>
      writeContract(config, {
        address: tradeExecutor,
        abi: TradeExecutorAbi,
        functionName: "setTemporaryPermission",
        args: [sessionAccount.address, BigInt(expiry)],
      }),
    );

    if (!result.status) {
      throw new Error("Failed to authorize session key");
    }
  }

  return sessionAccount;
};
