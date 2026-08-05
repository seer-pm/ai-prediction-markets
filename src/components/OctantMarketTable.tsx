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
  Tr,
} from "@/components/ui";
import { ExportWeightsButton } from "@/components/contest/ExportWeightsButton";
import { TableData } from "@/types";
import { DECIMALS } from "@/utils/constants";
import { formatPercent, formatSignedPercent, formatTokenAmount, preciseValue,
  maxAbs,
} from "@/utils/format";
import React, { useMemo, type ReactNode } from "react";

interface MarketTableProps {
  rows: TableData[];
  isLoading: boolean;
  isLoadingBalances: boolean;
  emptyState?: ReactNode;
  onExport?: () => void;
  exportDisabled?: boolean;
}

const asPercent = (value: number | null | undefined) =>
  typeof value === "number" ? value * 100 : undefined;

const OctantMarketTableInner: React.FC<MarketTableProps> = ({
  rows,
  isLoading,
  isLoadingBalances,
  emptyState,
  onExport,
  exportDisabled,
}) => {
  const visibleRows = useMemo(
    () => rows.filter((row) => !row.repo.toLowerCase().includes("invalid result")),
    [rows],
  );
  const scale = useMemo(
    () => maxAbs(visibleRows.map((row) => asPercent(row.difference))),
    [visibleRows],
  );

  return (
    <Card flush>
      <CardHeader
        eyebrow="Octant"
        title="Project funding share"
        description="Each project's share of the round, as a percentage."
        actions={
          onExport && <ExportWeightsButton onClick={onExport} disabled={exportDisabled} />
        }
      />

      {isLoading ? (
        <TableSkeleton columns={5} />
      ) : visibleRows.length === 0 ? (
        emptyState
      ) : (
        <TableScroller>
          <Table minWidth={760}>
            <Thead>
              <Th pinned>Project</Th>
              <Th numeric>Balance</Th>
              <Th numeric>Market %</Th>
              <Th numeric>Predicted %</Th>
              <Th numeric>Difference</Th>
            </Thead>
            <Tbody>
              {visibleRows.map((row) => (
                <Tr key={row.outcomeId}>
                  <Td pinned>
                    <span className="block max-w-[220px] truncate sm:max-w-sm" title={row.repo}>
                      {row.repo}
                    </span>
                  </Td>
                  <Td numeric>
                    {isLoadingBalances ? (
                      <Skeleton className="ml-auto" width={48} height={9} />
                    ) : (
                      formatTokenAmount(
                        typeof row.balance === "bigint" ? row.balance : undefined,
                        DECIMALS,
                      )
                    )}
                  </Td>
                  <Td numeric title={preciseValue(asPercent(row.currentPrice))}>
                    {formatPercent(asPercent(row.currentPrice))}
                  </Td>
                  <Td numeric className="text-ink" title={preciseValue(asPercent(row.predictedWeight))}>
                    {formatPercent(asPercent(row.predictedWeight))}
                  </Td>
                  <Td className="text-right">
                    <DeltaCell
                      value={asPercent(row.difference)}
                      max={scale}
                      format={formatSignedPercent}
                      title={preciseValue(asPercent(row.difference))}
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

export const OctantMarketTable = React.memo(OctantMarketTableInner);
