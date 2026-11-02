import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPTIMISM_MAX_TX_GAS } from "@/utils/constants";

// The RPC, the wallet and the session key are the edges; what is under test is how the batch loop
// simulates, signs, funds and retries around them.
const chain = vi.hoisted(() => ({
  simulateContract: vi.fn(),
  getBlockNumber: vi.fn(),
  getTransactionCount: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  estimateFeesPerGas: vi.fn(),
  authorizeSessionKey: vi.fn(),
  fundSessionKey: vi.fn(),
  prepareTransactionRequest: vi.fn(),
  signTransaction: vi.fn(),
  sendRawTransaction: vi.fn(),
}));

vi.mock("@wagmi/core", () => ({
  simulateContract: chain.simulateContract,
  getBlockNumber: chain.getBlockNumber,
  getTransactionCount: chain.getTransactionCount,
  waitForTransactionReceipt: chain.waitForTransactionReceipt,
  estimateFeesPerGas: chain.estimateFeesPerGas,
  getCallsStatus: vi.fn(),
  getTransactionReceipt: vi.fn(),
  sendCalls: vi.fn(),
  waitForCallsStatus: vi.fn(),
  writeContract: vi.fn(),
  ConnectorNotConnectedError: class extends Error {},
}));
vi.mock("@/config/wagmi", () => ({ config: {}, OPTIMISM_TRANSPORT: {} }));
vi.mock("@/hooks/useCheck7702Support", () => ({}));
vi.mock("./on-chain/sessionKey", () => ({
  authorizeSessionKey: chain.authorizeSessionKey,
  fundSessionKey: chain.fundSessionKey,
}));
vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createWalletClient: () => ({
    prepareTransactionRequest: chain.prepareTransactionRequest,
    signTransaction: chain.signTransaction,
    sendRawTransaction: chain.sendRawTransaction,
  }),
}));

const EXECUTOR = "0x00000000000000000000000000000000000000ee";
const call = { to: "0x00000000000000000000000000000000000000c1", data: "0x" } as const;
const batch = (message: string) => ({ calls: [call], message, skipFailCalls: false });

// The nonces the batches were signed with, in order.
const signedNonces = () =>
  chain.prepareTransactionRequest.mock.calls.map(([request]) => request.nonce as number);
const sentBytes = () => chain.sendRawTransaction.mock.calls.map(([args]) => args.serializedTransaction);

// `lastSentBlock` and the nonce tracker are module state; a fresh module per test keeps one test's
// transactions out of the next.
const load = async () => {
  vi.resetModules();
  return import("./toastify");
};

beforeEach(() => {
  // `restoreMocks` clears implementations between tests, so every edge is re-armed here.
  chain.estimateFeesPerGas.mockResolvedValue({ maxFeePerGas: 10n, maxPriorityFeePerGas: 1n });
  chain.authorizeSessionKey.mockResolvedValue({ address: "0x00000000000000000000000000000000000000aa" });
  chain.fundSessionKey.mockResolvedValue(undefined);
  chain.simulateContract.mockReset().mockResolvedValue({ request: {} });
  // The node answering reads is one block behind the one that returned the receipt.
  chain.getBlockNumber.mockReset().mockResolvedValue(99n);
  chain.getTransactionCount.mockReset().mockResolvedValue(5);
  chain.waitForTransactionReceipt.mockReset().mockResolvedValue({
    status: "success",
    blockNumber: 100n,
    transactionHash: "0xhash",
  });
  chain.prepareTransactionRequest.mockReset().mockImplementation(async (request) => request);
  // Distinct bytes per nonce, so a re-sign is visible in what was sent.
  chain.signTransaction
    .mockReset()
    .mockImplementation(async (request) => `0x${request.nonce.toString(16).padStart(2, "0")}aa`);
  chain.sendRawTransaction.mockReset().mockResolvedValue("0xignored");
});

describe("simulation after a batch lands", () => {
  it("simulates the next batch no earlier than the block of the last receipt", async () => {
    const { toastifyBatchTxSessionKey } = await load();

    const result = await toastifyBatchTxSessionKey(EXECUTOR, [batch("mint"), batch("split")], vi.fn());

    expect(result.status).toBe(true);
    expect(chain.simulateContract.mock.calls[1][1].blockNumber).toBe(100n);
  });

  it("retries a failed simulation, so a lagging node does not stop the run", async () => {
    chain.simulateContract
      .mockResolvedValueOnce({ request: {} })
      .mockRejectedValueOnce(new Error("header not found"))
      .mockResolvedValue({ request: {} });
    const { toastifyBatchTxSessionKey } = await load();

    const result = await toastifyBatchTxSessionKey(EXECUTOR, [batch("mint"), batch("split")], vi.fn());

    expect(result.status).toBe(true);
    expect(chain.sendRawTransaction).toHaveBeenCalledTimes(2);
  });

  it("reports how many batches landed when a later one really fails", async () => {
    chain.simulateContract
      .mockResolvedValueOnce({ request: {} })
      .mockRejectedValue(new Error("execution reverted"));
    const { toastifyBatchTxSessionKey } = await load();

    const result = await toastifyBatchTxSessionKey(EXECUTOR, [batch("mint"), batch("split")], vi.fn());

    expect(result).toMatchObject({ status: false, completedBatches: 1 });
    // One simulation for the mint, then the full retry budget for the split before giving up.
    expect(chain.simulateContract).toHaveBeenCalledTimes(4);
    expect(chain.sendRawTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("nonce", () => {
  it("resends the identical signed bytes when a send errors, so a batch can land only once", async () => {
    chain.sendRawTransaction.mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValue("0x");
    const { toastifyBatchTxSessionKey } = await load();

    const result = await toastifyBatchTxSessionKey(EXECUTOR, [batch("mint")], vi.fn());

    expect(result.status).toBe(true);
    expect(signedNonces()).toEqual([5]);
    expect(sentBytes()).toEqual(["0x05aa", "0x05aa"]);
  });

  it("takes 'already known' as sent and waits for that transaction", async () => {
    chain.sendRawTransaction.mockRejectedValue(new Error("already known"));
    const { toastifyBatchTxSessionKey } = await load();

    const result = await toastifyBatchTxSessionKey(EXECUTOR, [batch("mint")], vi.fn());

    expect(result.status).toBe(true);
    expect(chain.sendRawTransaction).toHaveBeenCalledTimes(1);
  });

  it("re-signs with a later nonce when the very first send is refused as nonce too low", async () => {
    chain.sendRawTransaction.mockRejectedValueOnce(new Error("nonce too low")).mockResolvedValue("0x");
    const { toastifyBatchTxSessionKey } = await load();

    const result = await toastifyBatchTxSessionKey(EXECUTOR, [batch("mint")], vi.fn());

    expect(result.status).toBe(true);
    expect(signedNonces()).toEqual([5, 6]);
  });

  it("never re-signs once the bytes may have reached a node — nonce too low then means it landed", async () => {
    chain.sendRawTransaction
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("nonce too low"));
    const { toastifyBatchTxSessionKey } = await load();

    const result = await toastifyBatchTxSessionKey(EXECUTOR, [batch("mint")], vi.fn());

    expect(result.status).toBe(true);
    expect(signedNonces()).toEqual([5]);
  });

  it("never reuses a nonce across batches, even when the node's count is stale", async () => {
    // The node keeps reporting 5 though batch one already used it.
    const { toastifyBatchTxSessionKey } = await load();

    await toastifyBatchTxSessionKey(EXECUTOR, [batch("mint"), batch("split")], vi.fn());

    expect(signedNonces()).toEqual([5, 6]);
  });
});

describe("funds", () => {
  it("funds every batch at the full gas limit and the fee cap the batches are signed with", async () => {
    const { toastifyBatchTxSessionKey } = await load();

    await toastifyBatchTxSessionKey(EXECUTOR, [batch("mint"), batch("split")], vi.fn());

    // Estimate 10 with 50% headroom.
    const feeCap = 15n;
    expect(chain.fundSessionKey.mock.calls[0][0]).toBe(OPTIMISM_MAX_TX_GAS * 2n * feeCap);
    expect(chain.prepareTransactionRequest.mock.calls[0][0]).toMatchObject({
      gas: OPTIMISM_MAX_TX_GAS,
      maxFeePerGas: feeCap,
    });
  });

  it("resends once before asking the user for more gas — a lagging node may not see the top-up", async () => {
    chain.sendRawTransaction
      .mockRejectedValueOnce(new Error("insufficient funds for gas * price + value"))
      .mockResolvedValue("0x");
    const { toastifyBatchTxSessionKey } = await load();

    const result = await toastifyBatchTxSessionKey(EXECUTOR, [batch("mint")], vi.fn());

    expect(result.status).toBe(true);
    // Only the up-front funding: no second wallet prompt.
    expect(chain.fundSessionKey).toHaveBeenCalledTimes(1);
    expect(sentBytes()).toEqual(["0x05aa", "0x05aa"]);
  });
});

describe("session key", () => {
  it("passes the caller's permission window through, so an unwind does not demand a fresh one", async () => {
    const { toastifyBatchTxSessionKey, UNWIND_MIN_PERMISSION_SECONDS } = await load();

    await toastifyBatchTxSessionKey(EXECUTOR, [batch("merge")], vi.fn(), undefined, {
      minPermissionSeconds: UNWIND_MIN_PERMISSION_SECONDS,
    });

    expect(chain.authorizeSessionKey.mock.calls[0][2]).toBe(5 * 60);
  });
});
