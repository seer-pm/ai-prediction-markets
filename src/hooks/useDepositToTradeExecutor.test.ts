import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, erc20Abi } from "viem";

const edges = vi.hoisted(() => ({
  writeContract: vi.fn(),
  toastifyTx: vi.fn(),
  toastifySendCallsTx: vi.fn(),
  noteSentBlock: vi.fn(),
}));

vi.mock("@wagmi/core", () => ({ writeContract: edges.writeContract }));
vi.mock("@/config/wagmi", () => ({ config: {} }));
vi.mock("@/config/queryClient", () => ({ queryClient: {} }));
vi.mock("@/lib/toastify", () => ({
  toastifyTx: edges.toastifyTx,
  toastifySendCallsTx: edges.toastifySendCallsTx,
  noteSentBlock: edges.noteSentBlock,
}));

import { depositToTradeExecutor } from "./useDepositToTradeExecutor";

const EXECUTOR = "0x00000000000000000000000000000000000000e1";
const TOKENS = [
  "0x00000000000000000000000000000000000000a1",
  "0x00000000000000000000000000000000000000a2",
  "0x00000000000000000000000000000000000000a3",
] as const;
const AMOUNTS = [1n, 2n, 3n];

beforeEach(() => {
  vi.clearAllMocks();
  // toastifyTx runs the write it is handed, as the real one does.
  edges.toastifyTx.mockImplementation(async (write: () => Promise<unknown>) => {
    await write();
    return { status: true, receipt: { blockNumber: 1n } };
  });
  edges.writeContract.mockResolvedValue("0xhash");
  edges.toastifySendCallsTx.mockResolvedValue({ status: true, receipt: { blockNumber: 2n } });
});

describe("depositToTradeExecutor", () => {
  it("transfers every token, not just the first, when the wallet does not batch", async () => {
    await depositToTradeExecutor({
      tradeExecutor: EXECUTOR,
      tokens: [...TOKENS],
      amounts: AMOUNTS,
      use7702: false,
    });

    expect(edges.writeContract).toHaveBeenCalledTimes(3);
    edges.writeContract.mock.calls.forEach(([, request], i) => {
      expect(request).toMatchObject({
        address: TOKENS[i],
        functionName: "transfer",
        args: [EXECUTOR, AMOUNTS[i]],
      });
    });
    expect(edges.noteSentBlock).toHaveBeenCalledTimes(3);
  });

  it("stops at the first failed transfer and surfaces its error", async () => {
    const declined = new Error("User rejected the request.");
    edges.toastifyTx
      .mockImplementationOnce(async () => ({ status: true, receipt: { blockNumber: 1n } }))
      .mockImplementationOnce(async () => ({ status: false, error: declined }));

    await expect(
      depositToTradeExecutor({
        tradeExecutor: EXECUTOR,
        tokens: [...TOKENS],
        amounts: AMOUNTS,
        use7702: false,
      }),
    ).rejects.toBe(declined);
    expect(edges.toastifyTx).toHaveBeenCalledTimes(2);
  });

  it("sends the transfers as wallet calls when the wallet batches", async () => {
    await depositToTradeExecutor({
      tradeExecutor: EXECUTOR,
      tokens: [...TOKENS],
      amounts: AMOUNTS,
      use7702: true,
    });

    expect(edges.writeContract).not.toHaveBeenCalled();
    expect(edges.toastifySendCallsTx).toHaveBeenCalledTimes(1);
    const calls = edges.toastifySendCallsTx.mock.calls[0][0] as { to: string; data: `0x${string}` }[];
    expect(calls.map((call) => call.to)).toEqual([...TOKENS]);
    calls.forEach((call, i) => {
      expect(decodeFunctionData({ abi: erc20Abi, data: call.data })).toEqual({
        functionName: "transfer",
        args: [EXECUTOR, AMOUNTS[i]],
      });
    });
    expect(edges.noteSentBlock).toHaveBeenCalledWith({ blockNumber: 2n });
  });

  it("throws when the batched send fails", async () => {
    const failed = new Error("batch failed");
    edges.toastifySendCallsTx.mockResolvedValue({ status: false, error: failed });
    await expect(
      depositToTradeExecutor({
        tradeExecutor: EXECUTOR,
        tokens: [...TOKENS],
        amounts: AMOUNTS,
        use7702: true,
      }),
    ).rejects.toBe(failed);
  });
});
