import {
  Card,
  CardHeader,
  DeltaCell,
  EmptyState,
  MultiSelect,
  Skeleton,
  Table,
  TableScroller,
  TableSkeleton,
  TableToolbar,
  Tbody,
  Td,
  TextInput,
  Th,
  Thead,
  Tr,
} from "@/components/ui";
import { L2TableData } from "@/types";
import { DECIMALS } from "@/utils/constants";
import {  formatSignedWeight,
  formatTokenAmount,
  formatWeight,
  preciseValue,
  pluralize,
  maxAbs,
} from "@/utils/format";
import React, { useMemo, useState, type ReactNode } from "react";
import MarketsPagination from "./MarketsPagination";

const PAGE_SIZE = 50;

interface MarketTableProps {
  rows: L2TableData[];
  isLoading: boolean;
  isLoadingBalances: boolean;
  emptyState?: ReactNode;
}

const L2MarketTableInner: React.FC<MarketTableProps> = ({
  rows,
  isLoading,
  isLoadingBalances,
  emptyState,
}) => {
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");

  const visibleRows = useMemo(
    () => rows.filter((row) => row.repo !== "Invalid result" && row.dependency !== "Invalid result"),
    [rows],
  );

  const repoOptions = useMemo(
    () =>
      Array.from(new Set(visibleRows.map((row) => row.repo)))
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        .map((repo) => ({ id: repo, text: repo })),
    [visibleRows],
  );

  const filteredRows = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    return visibleRows.filter((row) => {
      const matchesText =
        !needle ||
        row.dependency.toLowerCase().includes(needle) ||
        row.repo.toLowerCase().includes(needle);
      const matchesRepo = selectedRepos.length === 0 || selectedRepos.includes(row.repo);
      return matchesText && matchesRepo;
    });
  }, [visibleRows, searchText, selectedRepos]);

  // Scale bars against the whole set, not the current filter, so narrowing the
  // view doesn't silently rescale every bar in it.
  const scale = useMemo(() => maxAbs(visibleRows.map((row) => row.difference)), [visibleRows]);

  const pageCount = Math.ceil(filteredRows.length / PAGE_SIZE);
  const safePage = Math.min(pageIndex, Math.max(pageCount - 1, 0));
  const pageRows = filteredRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const isFiltered = !!searchText.trim() || selectedRepos.length > 0;

  return (
    <Card flush>
      <CardHeader
        title="Dependency contribution by repository"
        description="Each repository's dependencies, weighted within that repository."
      />

      {isLoading ? (
        <TableSkeleton columns={6} />
      ) : visibleRows.length === 0 ? (
        emptyState
      ) : (
        <>
          <TableToolbar>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <TextInput
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  setPageIndex(0);
                }}
                placeholder="Search dependencies or repositories"
                className="sm:max-w-xs"
              />
              <MultiSelect
                placeholder="All repositories"
                options={repoOptions}
                checkedIds={selectedRepos}
                onChange={(ids) => {
                  setSelectedRepos(ids);
                  setPageIndex(0);
                }}
              />
            </div>
            <p className="text-body text-ink-3">
              {isFiltered
                ? `${pluralize(filteredRows.length, "match", "matches")} of ${visibleRows.length}`
                : pluralize(visibleRows.length, "dependency", "dependencies")}
            </p>
          </TableToolbar>

          {filteredRows.length === 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              description="Try a different search term, or clear the repository filter."
            />
          ) : (
            <TableScroller>
              <Table minWidth={900}>
                <Thead>
                  <Th pinned>Dependency</Th>
                  <Th>Repository</Th>
                  <Th numeric>Balance</Th>
                  <Th numeric>Market</Th>
                  <Th numeric>Predicted</Th>
                  <Th numeric>Difference</Th>
                </Thead>
                <Tbody>
                  {pageRows.map((row) => (
                    <Tr key={row.outcomeId}>
                      <Td pinned>
                        <span
                          className="block max-w-[180px] truncate sm:max-w-xs"
                          title={row.dependency}
                        >
                          {row.dependency}
                        </span>
                      </Td>
                      <Td className="text-ink-3">
                        <span className="block max-w-[180px] truncate" title={row.repo}>
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

          {pageCount > 1 && (
            <div className="py-3">
              <MarketsPagination
                pageCount={pageCount}
                handlePageClick={({ selected }) => setPageIndex(selected)}
                page={safePage + 1}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
};

export const L2MarketTable = React.memo(L2MarketTableInner);
