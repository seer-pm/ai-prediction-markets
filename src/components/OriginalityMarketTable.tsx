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
  Tooltip,
  Tr,
} from "@/components/ui";
import { HelpIcon } from "@/components/ui/icons";
import { ExportWeightsButton } from "@/components/contest/ExportWeightsButton";
import { OriginalityTableData } from "@/types";
import { DECIMALS } from "@/utils/constants";
import { formatSignedWeight, formatTokenAmount, formatWeight, preciseValue } from "@/utils/format";
import React, { useMemo, type ReactNode } from "react";

// Written in the table's own column names, so the equation points at what is on screen.
const DIFFERENCE_HELP = {
  UP: "= Predicted − Market UP",
  DOWN: "= 1 − Predicted − Market DOWN",
} as const;

/**
 * A Difference header with a "?" that says what it is measured against. The table has no Fair
 * column — UP's fair price is the Predicted column and DOWN's is 1 − it — so this is where the
 * target is spelled out.
 */
const DifferenceHeader = ({ side }: { side: "UP" | "DOWN" }) => (
  <span className="inline-flex items-center gap-1">
    Difference
    <Tooltip content={<span className="font-mono">{DIFFERENCE_HELP[side]}</span>}>
      <button
        type="button"
        aria-label={`How the ${side} difference is calculated`}
        className="cursor-help text-ink-4 transition-colors hover:text-ink"
      >
        <HelpIcon />
      </button>
    </Tooltip>
  </span>
);

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
          <Table minWidth={820}>
            <Thead multiRow>
              <Thr>
                <Th pinned rowSpan={2} className="align-bottom">
                  Repository
                </Th>
                <Th numeric rowSpan={2} className="align-bottom">
                  Predicted
                </Th>
                <Th colSpan={3} className="border-l border-rule text-center text-long">
                  Up · original work
                </Th>
                <Th colSpan={3} className="border-l border-rule text-center text-short">
                  Down · dependencies
                </Th>
              </Thr>
              <Thr>
                <Th numeric className="border-l border-rule">
                  Balance
                </Th>
                <Th numeric>Market</Th>
                <Th numeric>
                  <DifferenceHeader side="UP" />
                </Th>
                <Th numeric className="border-l border-rule">
                  Balance
                </Th>
                <Th numeric>Market</Th>
                <Th numeric>
                  <DifferenceHeader side="DOWN" />
                </Th>
              </Thr>
            </Thead>
            <Tbody>
              {visibleRows.map((market) => (
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
                  <Td className="text-right">
                    <DeltaCell
                      value={market.upDifference}
                      bar={false}
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
                  <Td className="text-right">
                    <DeltaCell
                      value={market.downDifference}
                      bar={false}
                      format={formatSignedWeight}
                      title={preciseValue(market.downDifference)}
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

export const OriginalityMarketTable = React.memo(OriginalityMarketTableInner);
