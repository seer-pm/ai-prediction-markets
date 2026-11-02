import { afterEach, describe, expect, it, vi } from "vitest";

// The lock is all that is under test; the chain-facing imports are never reached.
vi.mock("@/config/wagmi", () => ({ config: {}, OPTIMISM_TRANSPORT: {} }));
vi.mock("../toastify", () => ({}));

import { withRunLock } from "./sessionKey";

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
