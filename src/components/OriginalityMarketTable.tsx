import {
  Card,
  CardHeader,
  DeltaCell,
  Skeleton,
  Table,
  TableScroller,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Thr,
  Tr,
} from "@/components/ui";
import { ExportWeightsButton } from "@/components/contest/ExportWeightsButton";
import { OriginalityTableData } from "@/types";
import { DECIMALS } from "@/utils/constants";
import { formatSignedWeight, formatTokenAmount, formatWeight, preciseValue,
  maxAbs,
} from "@/utils/format";
import React, { useMemo, type ReactNode } from "react";

interface MarketTableProps {
  markets: OriginalityTableData[];
  isLoading: boolean;
  isLoadingBalances: boolean;
  emptyState?: ReactNode;
  onExport?: () => void;
  exportDisabled?: boolean;
}

const OriginalityMarketTableInner: React.FC<MarketTableProps> = ({
  markets,
  isLoading,
  isLoadingBalances,
  emptyState,
  onExport,
  exportDisabled,
}) => {
  const visibleRows = useMemo(
    () => markets.filter((market) => market.repo !== "Invalid result"),
    [markets],
  );

  // One scale across both sides, so an UP bar and a DOWN bar of equal length
  // mean an equal edge.
  const scale = useMemo(
    () => maxAbs(visibleRows.flatMap((row) => [row.upDifference, row.downDifference])),
    [visibleRows],
  );

  return (
    <Card flush>
      <CardHeader
        eyebrow="Originality"
        title="Original work per repository"
        description="Each repository trades as a pair: UP is the share of original work, DOWN the share carried by dependencies."
        actions={
          onExport && <ExportWeightsButton onClick={onExport} disabled={exportDisabled} />
        }
      />

      {isLoading ? (
        <TableSkeleton columns={8} />
      ) : visibleRows.length === 0 ? (
        emptyState
      ) : (
        <TableScroller>
          <Table minWidth={1080}>
            <Thead multiRow>
              <Thr>
                <Th pinned rowSpan={2} className="align-bottom">
                  Repository
                </Th>
                <Th numeric rowSpan={2} className="align-bottom">
                  Predicted
                </Th>
                <Th colSpan={4} className="border-l border-rule text-center text-long">
                  Up · original work
                </Th>
                <Th colSpan={4} className="border-l border-rule text-center text-short">
                  Down · dependencies
                </Th>
              </Thr>
              <Thr>
                <Th numeric className="border-l border-rule">
                  Balance
                </Th>
                <Th numeric>Market</Th>
                <Th numeric>Fair</Th>
                <Th numeric>Difference</Th>
                <Th numeric className="border-l border-rule">
                  Balance
                </Th>
                <Th numeric>Market</Th>
                <Th numeric>Fair</Th>
                <Th numeric>Difference</Th>
              </Thr>
            </Thead>
            <Tbody>
              {visibleRows.map((market) => {
                const downFair =
                  typeof market.predictedOriginality === "number"
                    ? 1 - market.predictedOriginality
                    : undefined;

                return (
                  <Tr key={market.marketId}>
                    <Td pinned>
                      <span className="block max-w-[200px] truncate sm:max-w-xs" title={market.repo}>
                        {market.repo}
                      </span>
                    </Td>
                    <Td numeric className="text-ink" title={preciseValue(market.predictedOriginality)}>
                      {formatWeight(market.predictedOriginality)}
                    </Td>

                    <Td numeric className="border-l border-rule">
                      {isLoadingBalances ? (
                        <Skeleton className="ml-auto" width={44} height={9} />
                      ) : (
                        formatTokenAmount(
                          typeof market.upBalance === "bigint" ? market.upBalance : undefined,
                          DECIMALS,
                        )
                      )}
                    </Td>
                    <Td numeric title={preciseValue(market.upPrice)}>
                      {formatWeight(market.upPrice)}
                    </Td>
                    <Td numeric className="text-ink-3">
                      {formatWeight(market.predictedOriginality)}
                    </Td>
                    <Td className="text-right">
                      <DeltaCell
                        value={market.upDifference}
                        max={scale}
                        format={formatSignedWeight}
                        title={preciseValue(market.upDifference)}
                      />
                    </Td>

                    <Td numeric className="border-l border-rule">
                      {isLoadingBalances ? (
                        <Skeleton className="ml-auto" width={44} height={9} />
                      ) : (
                        formatTokenAmount(
                          typeof market.downBalance === "bigint" ? market.downBalance : undefined,
                          DECIMALS,
                        )
                      )}
                    </Td>
                    <Td numeric title={preciseValue(market.downPrice)}>
                      {formatWeight(market.downPrice)}
                    </Td>
                    <Td numeric className="text-ink-3">
                      {formatWeight(downFair)}
                    </Td>
                    <Td className="text-right">
                      <DeltaCell
                        value={market.downDifference}
                        max={scale}
                        format={formatSignedWeight}
                        title={preciseValue(market.downDifference)}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableScroller>
      )}
    </Card>
  );
};

export const OriginalityMarketTable = React.memo(OriginalityMarketTableInner);
