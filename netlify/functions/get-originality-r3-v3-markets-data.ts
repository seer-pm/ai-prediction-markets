import { ORIGINALITY_R3_V3_MARKETS } from "@/utils/originalityR3V3Markets";
import { serveOriginalityOnChainData } from "./utils/originalityOnChainData";
import {
  fetchOriginalityR3V3MarketsOnChain,
  fetchOriginalityR3V3ParentOnChain,
} from "./utils/originalityR3OnChain";

/** Prices for the 98 corrected round-3 Originality markets. See `utils/originalityOnChainData`. */
export default (req: Request) =>
  serveOriginalityOnChainData(req, {
    marketList: ORIGINALITY_R3_V3_MARKETS,
    fetchParent: fetchOriginalityR3V3ParentOnChain,
    fetchMarkets: fetchOriginalityR3V3MarketsOnChain,
  });
