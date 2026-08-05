import {
  Card,
  CardHeader,
  EmptyState,
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
import { TableData } from "@/types";
import { DECIMALS } from "@/utils/constants";
import { formatTokenAmount, formatWeight, preciseValue } from "@/utils/format";
import React, { useMemo, useState } from "react";
import MarketsPagination from "./MarketsPagination";

const PAGE_SIZE = 50;

interface MarketTableProps {
  rows: TableData[];
  isLoading: boolean;
  isLoadingBalances: boolean;
}

const MarketTableInner: React.FC<MarketTableProps> = ({ rows, isLoading, isLoadingBalances }) => {
  const [pageIndex, setPageIndex] = useState(0);

  const visibleRows = useMemo(() => rows.filter((row) => row.repo !== "Invalid result"), [rows]);
  const pageCount = Math.ceil(visibleRows.length / PAGE_SIZE);
  const pageRows = visibleRows.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);

  return (
    <Card flush>
      <CardHeader
        eyebrow="Round 1 · Settled"
        title="Repository contribution to Ethereum"
        description="Final resolved weights. Any balances you still hold can be redeemed."
      />

      {isLoading ? (
        <TableSkeleton columns={3} />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          title="No positions in this contest"
          description="Round 1 has settled. If you held outcome tokens here, they would appear in this table."
        />
      ) : (
        <>
          <TableScroller>
            <Table minWidth={620}>
              <Thead>
                <Th pinned>Repository</Th>
                <Th numeric>Balance</Th>
                <Th numeric>Resolved weight</Th>
              </Thead>
              <Tbody>
                {pageRows.map((row) => (
                  <Tr key={row.outcomeId}>
                    <Td pinned>
                      <span className="block max-w-[240px] truncate sm:max-w-md" title={row.repo}>
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
                    <Td numeric className="text-ink" title={preciseValue(row.payout)}>
                      {formatWeight(row.payout)}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableScroller>

          {pageCount > 1 && (
            <div className="py-3">
              <MarketsPagination
                pageCount={pageCount}
                handlePageClick={({ selected }) => setPageIndex(selected)}
                page={pageIndex + 1}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
};

export const MarketTable = React.memo(MarketTableInner);
