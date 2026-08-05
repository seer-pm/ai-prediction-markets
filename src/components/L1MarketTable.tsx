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
import { formatSignedWeight, formatTokenAmount, formatWeight, preciseValue,
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

const L1MarketTableInner: React.FC<MarketTableProps> = ({
  rows,
  isLoading,
  isLoadingBalances,
  emptyState,
  onExport,
  exportDisabled,
}) => {
  const visibleRows = useMemo(
    () => rows.filter((row) => !row.repo.includes("Other repositories")),
    [rows],
  );
  const scale = useMemo(() => maxAbs(visibleRows.map((row) => row.difference)), [visibleRows]);

  return (
    <Card flush>
      <CardHeader
        title="Repository contribution to Ethereum"
        description="Market weight against your predicted weight, per repository."
        actions={
          onExport && <ExportWeightsButton onClick={onExport} disabled={exportDisabled} />
        }
      />

      {isLoading ? (
        <TableSkeleton columns={6} />
      ) : visibleRows.length === 0 ? (
        emptyState
      ) : (
        <TableScroller>
          <Table minWidth={860}>
            <Thead>
              <Th pinned>Repository</Th>
              <Th>Parent</Th>
              <Th numeric>Balance</Th>
              <Th numeric>Market</Th>
              <Th numeric>Predicted</Th>
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
                  <Td className="text-ink-3">{row.parent ?? "—"}</Td>
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
                  <Td numeric title={preciseValue(row.currentPrice)}>
                    {formatWeight(row.currentPrice)}
                  </Td>
                  <Td numeric className="text-ink" title={preciseValue(row.predictedWeight)}>
                    {formatWeight(row.predictedWeight)}
                  </Td>
                  <Td className="text-right">
                    <DeltaCell
                      value={row.difference}
                      max={scale}
                      format={formatSignedWeight}
                      title={preciseValue(row.difference)}
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

export const L1MarketTable = React.memo(L1MarketTableInner);
