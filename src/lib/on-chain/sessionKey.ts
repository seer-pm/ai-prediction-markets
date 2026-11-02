import { TradeExecutorAbi } from "@/abis/TradeExecutorAbi";
import { config, OPTIMISM_TRANSPORT } from "@/config/wagmi";
import type { TxStateChange } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import {
  estimateFeesPerGas,
  getAccount,
  getBalance,
  readContract,
  sendTransaction,
  writeContract,
} from "@wagmi/core";
import { Address, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { handleTx, nextNonce, noteNonce, noteSentBlock, waitForSentBlock } from "../toastify";
import { CHAIN_ID } from "@/utils/constants";
import { TradeError } from "@/utils/errors";
import { optimism } from "viem/chains";

type SessionKeyData = {
  privateKey: `0x${string}`;
  address: `0x${string}`;
  stale: boolean;
  createdAt: number;
  activeTabs: string[];
};

export class SessionKeyManager {
  private static STORAGE_KEY = "trade_executor_session_key";

  static create(): `0x${string}` {
    const privateKey = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}` as `0x${string}`;

    const account = privateKeyToAccount(privateKey);

    const data: SessionKeyData = {
      privateKey,
      address: account.address,
      stale: false,
      createdAt: Date.now(),
      activeTabs: [],
    };

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    return data.privateKey;
  }

  static get(): `0x${string}` | null {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    return raw ? JSON.parse(raw).privateKey : null;
  }

  static getData(): SessionKeyData | null {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  static setData(data: SessionKeyData) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }

  static addActiveTab(tabId: string) {
    const data = this.getData();
    if (!data) return;

    if (!data.activeTabs.includes(tabId)) {
      data.activeTabs.push(tabId);
      this.setData(data);
    }
  }

  static removeActiveTab(tabId: string) {
    const data = this.getData();
    if (!data) return;

    data.activeTabs = data.activeTabs.filter((t) => t !== tabId);

    if (data.activeTabs.length === 0) {
      data.stale = true;
    }

    this.setData(data);
  }

  static markStale() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    data.stale = true;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }

  static clear() {
    sessionStorage.removeItem(this.STORAGE_KEY);
  }

  static getOrCreate(): `0x${string}` {
    return this.get() || this.create();
  }
}

export const getSessionAccount = (onStateChange: TxStateChange) => {
  let sessionPrivateKey = SessionKeyManager.get();
  let sessionAccount = sessionPrivateKey ? privateKeyToAccount(sessionPrivateKey) : null;

  // Create new session key if doesn't exist
  if (!sessionPrivateKey) {
    sessionPrivateKey = SessionKeyManager.create();
    sessionAccount = privateKeyToAccount(sessionPrivateKey);
    onStateChange({
      phase: "authorize",
      label: "Created a temporary signing key for this run.",
    });
  }

  return sessionAccount!;
};

export const fundSessionKey = async (gasCost: bigint, onStateChange: TxStateChange) => {
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
  onStateChange({
    phase: "authorize",
    label: "Approve the gas top-up in your wallet.",
  });
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
  // A node that has not seen the top-up refuses the next batch as unfunded.
  noteSentBlock(result.receipt);

  return sessionAccount!;
};

export const withdrawFundSessionKey = async () => {
  try {
    const sessionAccount = getSessionAccount(() => {});
    // Swept from a balance that predates the last batch, the transfer asks for more than is left.
    await waitForSentBlock();
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
        transport: OPTIMISM_TRANSPORT,
      });
      // On the batches' nonce sequence: a nonce read from a lagging node could otherwise be the
      // one a still-pending batch holds.
      const nonce = await nextNonce(sessionAccount.address);
      const result = await handleTx(() =>
        sessionWallet.sendTransaction({
          to: getAccount(config).address,
          value: balance - sendTxGasCost,
          nonce,
        }),
      );
      if (result.status) noteNonce(sessionAccount.address, nonce);
    }
  } catch (e) {
    console.log("Cannot refund session key ", e);
  }
};

export const authorizeSessionKey = async (
  tradeExecutor: Address,
  onStateChange: TxStateChange,
  // How long the permission must still run to be reused; see `toastifyBatchTxSessionKey`.
  minPermissionSeconds = 60 * 30,
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
  const atLeastFromNow =
    Number(currentExpiry) > Math.floor(new Date().getTime() / 1000) + minPermissionSeconds;
  const isPermitted =
    isTwoStringsEqual(currentSessionKey as Address, sessionAccount.address) && atLeastFromNow;
  if (!isPermitted) {
    const expiry = Math.floor(new Date().getTime() / 1000) + 60 * 60;
    onStateChange({
      phase: "authorize",
      label: "Approve the signing permission in your wallet.",
    });
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
    // The first batch is simulated as the session key; it must run on a node that has seen this.
    noteSentBlock(result.receipt);
  }

  return sessionAccount;
};

const RUN_LOCK = "trade-executor-session-key-run";

/**
 * Wraps a run so it holds the one lock every session-key run takes, across every tab of the app.
 *
 * The session key lives in localStorage, so every tab signs with the same key and funds and sweeps
 * the same balance. Two runs at once share a nonce sequence each tab tracks on its own, and one
 * run's closing sweep drains the gas the other is still spending — either can stop the other
 * half-way, minted and not traded. Web Locks are held per origin and released when the holding tab
 * closes or crashes, so the lock cannot outlive its run. A second run is refused, not queued:
 * queued, it would execute quotes taken before the first one moved the pools.
 */
export const withRunLock =
  <Args extends unknown[], T>(run: (...args: Args) => Promise<T>) =>
  (...args: Args): Promise<T> => {
    // No Web Locks (an old browser, or an insecure origin): unguarded, as before.
    if (typeof navigator === "undefined" || !navigator.locks) return run(...args);
    return navigator.locks.request(RUN_LOCK, { ifAvailable: true }, (lock) => {
      if (!lock) {
        throw new TradeError(
          "Another trade is already running in this browser, in this tab or another one.",
          "Wait for it to finish, then try again.",
        );
      }
      return run(...args);
    });
  };
