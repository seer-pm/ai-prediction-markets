import { ORIGINALITY_R3_MARKETS } from "@/utils/originalityR3Markets";
import { serveOriginalityOnChainData } from "./utils/originalityOnChainData";
import {
  fetchOriginalityR3MarketsOnChain,
  fetchOriginalityR3ParentOnChain,
} from "./utils/originalityR3OnChain";

/**
 * Prices for the FIRST round-3 Originality set — the one created without its middle level and
 * since replaced (`get-originality-r3-v3-markets-data`). Still served: the tab for it is
 * withdraw-only, and selling out of it needs live prices.
 */
export default (req: Request) =>
  serveOriginalityOnChainData(req, {
    marketList: ORIGINALITY_R3_MARKETS,
    fetchParent: fetchOriginalityR3ParentOnChain,
    fetchMarkets: fetchOriginalityR3MarketsOnChain,
  });
