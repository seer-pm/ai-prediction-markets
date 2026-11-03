import { afterEach, describe, expect, it, vi } from "vitest";

// The chain and the wallet are the edges; the key's lifecycle and the lock are what is under test.
const chain = vi.hoisted(() => ({
  permitted: "0x0000000000000000000000000000000000000000",
  expire: 0n,
  balances: {} as Record<string, bigint>,
  grant: vi.fn(),
  sent: [] as Array<{ from: string; to: string; value: bigint }>,
  sendFails: false,
}));

vi.mock("@/config/wagmi", () => ({ config: {}, OPTIMISM_TRANSPORT: {} }));
vi.mock("@wagmi/core", () => ({
  readContract: async (_config: unknown, { functionName }: { functionName: string }) =>
    functionName === "permitted" ? chain.permitted : chain.expire,
  writeContract: async (_config: unknown, request: { args: [string, bigint] }) => {
    chain.grant(request.args[0]);
    return "0xgrant";
  },
  getAccount: () => ({ address: OWNER }),
  getBalance: async (_config: unknown, { address }: { address: string }) => ({
    value: chain.balances[address.toLowerCase()] ?? 0n,
  }),
  estimateFeesPerGas: async () => ({ maxFeePerGas: 1n }),
  sendTransaction: vi.fn(),
}));
vi.mock("../toastify", () => ({
  handleTx: async (write: () => Promise<unknown>) => {
    try {
      await write();
      return { status: true, receipt: { blockNumber: 1n } };
    } catch (error) {
      return { status: false, error };
    }
  },
  nextNonce: async () => 0,
  noteNonce: () => {},
  noteSentBlock: () => {},
  waitForSentBlock: async () => {},
}));
vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createWalletClient: ({ account }: { account: { address: string } }) => ({
    sendTransaction: async ({ to, value }: { to: string; value: bigint }) => {
      if (chain.sendFails) throw new Error("fetch failed");
      chain.sent.push({ from: account.address.toLowerCase(), to, value });
      return "0xsweep";
    },
  }),
}));

import {
  SessionKeyManager,
  authorizeSessionKey,
  getSessionAccount,
  sweepRetiredSessionKeys,
  withRunLock,
} from "./sessionKey";

const OWNER = "0x00000000000000000000000000000000000000a1";
const EXECUTOR = "0x00000000000000000000000000000000000000e1";
const now = () => BigInt(Math.floor(Date.now() / 1000));

/** jsdom has no Web Locks; a single-origin stand-in with the `ifAvailable` semantics used here. */
const installLocks = () => {
  const held = new Set<string>();
  const locks = {
    request: async (
      name: string,
      _options: { ifAvailable: boolean },
      callback: (lock: { name: string } | null) => unknown,
    ) => {
      if (held.has(name)) return callback(null);
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
  vi.stubGlobal("navigator", { ...navigator, locks });
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("withRunLock", () => {
  it("refuses a second run while the first holds the lock", async () => {
    installLocks();
    const first = deferred();
    const running = withRunLock(() => first.promise)();

    await expect(withRunLock(async () => "second")()).rejects.toThrow(
      "Another trade is already running",
    );

    first.resolve();
    await running;
  });

  it("releases the lock when a run finishes, so the next one starts", async () => {
    installLocks();
    await withRunLock(async () => "first")();

    await expect(withRunLock(async () => "second")()).resolves.toBe("second");
  });

  it("releases the lock when a run fails", async () => {
    installLocks();
    await expect(
      withRunLock(async () => {
        throw new Error("run failed");
      })(),
    ).rejects.toThrow("run failed");

    await expect(withRunLock(async () => "next")()).resolves.toBe("next");
  });

  it("passes the mutation's arguments through", async () => {
    installLocks();
    const run = withRunLock(async (amount: string, market: string) => `${amount}@${market}`);

    await expect(run("50", "round3")).resolves.toBe("50@round3");
  });

  it("still runs where the browser has no Web Locks", async () => {
    vi.stubGlobal("navigator", { ...navigator, locks: undefined });

    await expect(withRunLock(async () => "ran")()).resolves.toBe("ran");
  });
});

describe("session key rotation", () => {
  // `restoreMocks` clears implementations between tests; storage and chain state are reset here.
  const reset = () => {
    localStorage.clear();
    chain.permitted = "0x0000000000000000000000000000000000000000";
    chain.expire = 0n;
    chain.balances = {};
    chain.grant.mockReset();
    chain.sent = [];
    chain.sendFails = false;
  };
  const currentKey = () => getSessionAccount(() => {}).address;

  it("reuses the key while its permission still runs", async () => {
    reset();
    const key = currentKey();
    SessionKeyManager.markGranted();
    chain.permitted = key;
    chain.expire = now() + 3600n;

    const account = await authorizeSessionKey(EXECUTOR, vi.fn());

    expect(account.address).toBe(key);
    expect(chain.grant).not.toHaveBeenCalled();
    expect(SessionKeyManager.getRetired()).toEqual([]);
  });

  it("grants a new permission to a fresh key once the old one's has run out", async () => {
    reset();
    const old = currentKey();
    SessionKeyManager.markGranted();
    chain.permitted = old;
    chain.expire = now() - 60n;

    const account = await authorizeSessionKey(EXECUTOR, vi.fn());

    expect(account.address).not.toBe(old);
    expect(chain.grant).toHaveBeenCalledWith(account.address);
    // The old key is retired, not deleted; holding no gas, the sweep then forgets it.
    await sweepRetiredSessionKeys();
    expect(SessionKeyManager.getRetired()).toEqual([]);
  });

  it("treats a key stored before rotation existed as granted, and rotates it", async () => {
    reset();
    // The shape every key in the field has today: no `granted`, and the old tab bookkeeping.
    const legacy = currentKey();
    const data = SessionKeyManager.getData()!;
    localStorage.setItem(
      "trade_executor_session_key",
      JSON.stringify({ privateKey: data.privateKey, address: data.address, stale: true, createdAt: 0, activeTabs: ["x"] }),
    );
    chain.permitted = legacy;
    chain.expire = now() - 60n;

    const account = await authorizeSessionKey(EXECUTOR, vi.fn());

    expect(account.address).not.toBe(legacy);
  });

  it("keeps a key that never held a permission, so a rejected prompt does not churn keys", async () => {
    reset();
    const fresh = currentKey(); // created, never granted
    chain.permitted = "0x00000000000000000000000000000000000000b0"; // another device's key
    chain.expire = now() + 3600n;

    const account = await authorizeSessionKey(EXECUTOR, vi.fn());

    expect(account.address).toBe(fresh);
    expect(chain.grant).toHaveBeenCalledWith(fresh);
  });

  it("does not wait for the full window on an unwind, so it neither prompts nor rotates", async () => {
    reset();
    const key = currentKey();
    SessionKeyManager.markGranted();
    chain.permitted = key;
    chain.expire = now() + 10n * 60n; // 10 minutes left: short of a fresh run's 30, enough for 5

    const account = await authorizeSessionKey(EXECUTOR, vi.fn(), 5 * 60);

    expect(account.address).toBe(key);
    expect(chain.grant).not.toHaveBeenCalled();
  });
});

describe("sweepRetiredSessionKeys", () => {
  const reset = () => {
    localStorage.clear();
    chain.balances = {};
    chain.sent = [];
    chain.sendFails = false;
  };
  const retireCurrentKey = (balance: bigint) => {
    const address = getSessionAccount(() => {}).address;
    chain.balances[address.toLowerCase()] = balance;
    SessionKeyManager.rotate(OWNER);
    return address;
  };

  it("sends a retired key's gas back to the wallet that funded it, then forgets the key", async () => {
    reset();
    const retired = retireCurrentKey(100_000n);

    await sweepRetiredSessionKeys();

    // Fee estimate 1 wei/gas: the transfer keeps back 30,000 for its own gas.
    expect(chain.sent).toEqual([{ from: retired.toLowerCase(), to: OWNER, value: 70_000n }]);
    expect(SessionKeyManager.getRetired()).toEqual([]);
  });

  it("keeps a key whose sweep failed, and retries it next time", async () => {
    reset();
    const retired = retireCurrentKey(100_000n);
    chain.sendFails = true;

    await sweepRetiredSessionKeys();
    expect(SessionKeyManager.getRetired().map((key) => key.address)).toEqual([retired]);

    chain.sendFails = false;
    await sweepRetiredSessionKeys();
    expect(chain.sent).toHaveLength(1);
    expect(SessionKeyManager.getRetired()).toEqual([]);
  });

  it("forgets a key holding less than a transfer would cost, without sending", async () => {
    reset();
    retireCurrentKey(20_000n);

    await sweepRetiredSessionKeys();

    expect(chain.sent).toEqual([]);
    expect(SessionKeyManager.getRetired()).toEqual([]);
  });
});
