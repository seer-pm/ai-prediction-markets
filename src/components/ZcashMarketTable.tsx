import { ExportWeightsButton } from "@/components/contest/ExportWeightsButton";
import {
  Card,
  CardHeader,
  DeltaCell,
  OutcomeBar,
  Skeleton,
  Table,
  TableScroller,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@/components/ui";
import { ExternalIcon } from "@/components/ui/icons";
import { ZcashTableData } from "@/types";
import { DECIMALS, getSeerMarketUrl } from "@/utils/constants";
import {
  formatSignedWeight,
  formatTokenAmount,
  formatWeight,
  maxAbs,
  preciseValue,
} from "@/utils/format";
import { ZCASH_FORUM_URL } from "@/utils/zcashMarkets";
import React, { useMemo, type ReactNode } from "react";

interface MarketTableProps {
  markets: ZcashTableData[];
  isLoading: boolean;
  isLoadingBalances: boolean;
  emptyState?: ReactNode;
  onExport?: () => void;
  exportDisabled?: boolean;
}

const ZcashMarketTableInner: React.FC<MarketTableProps> = ({
  markets,
  isLoading,
  isLoadingBalances,
  emptyState,
  onExport,
  exportDisabled,
}) => {
  // One scale across the whole column, so two bars of equal length mean an equal edge. YES alone:
  // the NO difference is its mirror whenever YES+NO sits at 1, and where it does not, that gap is
  // the arbitrage rather than the user's edge.
  const scale = useMemo(() => maxAbs(markets.map((market) => market.yesDifference)), [markets]);

  return (
    <Card flush>
      <CardHeader
        eyebrow="Zcash · Q3 2026"
        title="Predicted approval odds"
        description={
          <>
            One row per proposal on the Q3 grants ballot.{" "}
            <a
              href={ZCASH_FORUM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-semibold text-primary transition-colors hover:text-primary-hover"
            >
              Review thread
              <ExternalIcon width={13} height={13} />
            </a>
          </>
        }
        actions={
          onExport && (
            <ExportWeightsButton
              onClick={onExport}
              disabled={exportDisabled}
              label="Export market view"
            />
          )
        }
      />

      {isLoading ? (
        <TableSkeleton columns={6} />
      ) : markets.length === 0 ? (
        emptyState
      ) : (
        <TableScroller>
          <Table minWidth={900}>
            <Thead>
              <Th pinned>Proposal</Th>
              <Th title="What the market pays for yes and for no, out of one.">Market</Th>
              <Th numeric>Yes balance</Th>
              <Th numeric>No balance</Th>
              <Th numeric>Predicted</Th>
              <Th numeric>Difference</Th>
            </Thead>
            <Tbody>
              {markets.map((market) => (
                <Tr key={market.marketId}>
                  <Td pinned>
                    {/* The row's title doubles as the link to the market on Seer — the icon is what
                        says so, since the truncation already eats any trailing affordance. */}
                    <a
                      href={getSeerMarketUrl(market.marketId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group/link inline-flex max-w-[220px] items-center gap-1.5 text-ink transition-colors hover:text-primary sm:max-w-sm"
                      title={
                        market.applicant ? `${market.project} — ${market.applicant}` : market.project
                      }
                    >
                      <span className="truncate">{market.project}</span>
                      <ExternalIcon
                        width={13}
                        height={13}
                        className="shrink-0 text-ink-4 transition-colors group-hover/link:text-primary"
                      />
                    </a>
                  </Td>
                  <Td>
                    <OutcomeBar yes={market.yesPrice} no={market.noPrice} />
                  </Td>
                  <Td numeric>
                    {isLoadingBalances ? (
                      <Skeleton className="ml-auto" width={44} height={9} />
                    ) : (
                      formatTokenAmount(
                        typeof market.yesBalance === "bigint" ? market.yesBalance : undefined,
                        DECIMALS,
                      )
                    )}
                  </Td>
                  <Td numeric>
                    {isLoadingBalances ? (
                      <Skeleton className="ml-auto" width={44} height={9} />
                    ) : (
                      formatTokenAmount(
                        typeof market.noBalance === "bigint" ? market.noBalance : undefined,
                        DECIMALS,
                      )
                    )}
                  </Td>
                  <Td numeric className="text-ink" title={preciseValue(market.predictedProbability)}>
                    {formatWeight(market.predictedProbability)}
                  </Td>
                  <Td className="text-right">
                    <DeltaCell
                      value={market.yesDifference}
                      max={scale}
                      format={formatSignedWeight}
                      title={preciseValue(market.yesDifference)}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableScroller>
      )}
    </Card>
  );
};

export const ZcashMarketTable = React.memo(ZcashMarketTableInner);
