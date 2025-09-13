import { config } from "@/config/wagmi";
import { SupportedChain } from "@/utils/constants";
import { readContracts } from "@wagmi/core";

export async function readContractsInBatch(
  contracts: any[],
  chainId: SupportedChain,
  groupCount: number,
  retry?: boolean
) {
  try {
    // try to batch call
    let total: any[] = [];
    for (let i = 0; i < Math.ceil(contracts.length / groupCount); i++) {
      const data = await readContracts(config, {
        allowFailure: false,
        contracts: contracts.slice(i * groupCount, (i + 1) * groupCount),
        batchSize: 0,
      });
      total = total.concat(data);
      // wait 200 ms to not reach max rate limit
      await new Promise((res) => setTimeout(res, 200));
    }
    return total;
  } catch (e) {
    if (retry) {
      return await readContractsInBatch(contracts, chainId, 8);
    }
    throw e;
  }
}
