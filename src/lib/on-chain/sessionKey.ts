import { config } from "@/config/wagmi";
import { getBalance, readContract, sendTransaction, writeContract } from "@wagmi/core";
import { toast } from "react-toastify";
import { Address, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toastifyTx } from "../toastify";
import { TradeExecutorAbi } from "@/abis/TradeExecutorAbi";

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

const fundSessionKey = async (minBalance: bigint = parseEther("0.000001")) => {
  let sessionPrivateKey = SessionKeyManager.get();
  let sessionAccount = sessionPrivateKey ? privateKeyToAccount(sessionPrivateKey) : null;

  // Check if session key exists and has sufficient balance
  let balance: bigint = 0n;
  if (sessionAccount) {
    const data = await getBalance(config, {
      address: sessionAccount.address,
    });
    balance = data.value;
    if (balance >= minBalance) {
      return sessionAccount; // Already funded
    }
  }

  // Create new session key if doesn't exist
  if (!sessionPrivateKey) {
    sessionPrivateKey = SessionKeyManager.create();
    sessionAccount = privateKeyToAccount(sessionPrivateKey);

    toast.info(
      `Session key created: ${sessionAccount.address.slice(0, 6)}...${sessionAccount.address.slice(
        -4
      )}`
    );
  }

  // Prompt user to fund
  const fundAmount = minBalance - balance;

  const result = await toastifyTx(
    () =>
      sendTransaction(config, {
        to: sessionAccount!.address,
        value: fundAmount,
      }),
    {
      txSent: { title: "Funding session key..." },
      txSuccess: {
        title: `Session key funded! (${sessionAccount!.address.slice(0, 6)}...)`,
      },
    }
  );

  if (!result.status) {
    SessionKeyManager.clear();
    throw new Error("Failed to fund session key");
  }

  return sessionAccount!;
};

export const authorizeSessionKey = async (tradeExecutor: Address) => {
  const sessionAccount = await fundSessionKey();
  // Set session key in contract

  const currentSessionKey = (await readContract(config, {
    address: tradeExecutor,
    abi: TradeExecutorAbi,
    functionName: "sessionKey",
  })) as Address;

  if (currentSessionKey.toLowerCase() !== sessionAccount.address.toLowerCase()) {
    const result = await toastifyTx(
      () =>
        writeContract(config, {
          address: tradeExecutor,
          abi: TradeExecutorAbi,
          functionName: "setSessionKey",
          args: [sessionAccount.address],
        }),
      {
        txSent: { title: "Authorizing session key..." },
        txSuccess: { title: "Session key authorized!" },
      }
    );

    if (!result.status) {
      throw new Error("Failed to authorize session key");
    }
  }

  return sessionAccount;
};
