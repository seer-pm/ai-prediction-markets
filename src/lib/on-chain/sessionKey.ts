import { TradeExecutorAbi } from "@/abis/TradeExecutorAbi";
import { config } from "@/config/wagmi";
import { isTwoStringsEqual } from "@/utils/common";
import { getBalance, readContract, sendTransaction, writeContract } from "@wagmi/core";
import { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { handleTx } from "../toastify";

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
        -4
      )}`
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
    })
  );

  if (!result.status) {
    SessionKeyManager.clear();
    throw new Error("Failed to fund session key");
  }

  return sessionAccount!;
};

export const authorizeSessionKey = async (
  tradeExecutor: Address,
  onStateChange: (state: string) => void
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
  const now = Math.floor(new Date().getTime() / 1000);
  const isPermitted =
    isTwoStringsEqual(currentSessionKey as Address, sessionAccount.address) &&
    Number(currentExpiry) > now;
  if (!isPermitted) {
    const expiry = Math.floor(new Date().getTime() / 1000) + 60 * 15; //15 minutes
    onStateChange("Authorizing session key...");
    const result = await handleTx(() =>
      writeContract(config, {
        address: tradeExecutor,
        abi: TradeExecutorAbi,
        functionName: "setTemporaryPermission",
        args: [sessionAccount.address, BigInt(expiry)],
      })
    );

    if (!result.status) {
      throw new Error("Failed to authorize session key");
    }
  }

  return sessionAccount;
};
