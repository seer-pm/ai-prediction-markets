import { L2TableData } from "@/types";
import { DECIMALS } from "@/utils/constants";
import React, { useState } from "react";
import { formatUnits } from "viem";
import DropdownCheckbox from "./DropdownCheckbox";
import MarketsPagination from "./MarketsPagination";

interface MarketTableProps {
  rows: L2TableData[];
  isLoading: boolean;
  isLoadingBalances: boolean;
}

export const L2MarketTable: React.FC<MarketTableProps> = ({
  rows,
  isLoading,
  isLoadingBalances,
}) => {
  const PAGE_SIZE = 50;
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedRepos, setRepos] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");
  const repoOptions = Array.from(new Set(rows.map((x) => x.repo)))
    .map((x) => ({ id: x, text: x }))
    .sort((a, b) => {
      return a.text.toLowerCase() > b.text.toLowerCase() ? 1 : -1;
    });
  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-300 rounded w-1/4 mb-4"></div>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-4 bg-gray-300 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return null;
  }
  const filteredRows = rows.filter((row) => {
    const filteredText =
      row.dependency.toLowerCase().includes(searchText.toLowerCase()) ||
      row.repo.toLowerCase().includes(searchText.toLowerCase());
    const filteredChecked = !selectedRepos.length || selectedRepos.includes(row.repo);
    return filteredText && filteredChecked;
  });
  const pageCount = Math.ceil(filteredRows.length / PAGE_SIZE);

  const processedRows = filteredRows.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  return (
    <>
      <div className="flex items-center gap-2">
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search by dependencies or repos"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        ></input>
        <DropdownCheckbox
          placeholder="Filter by repo"
          options={repoOptions}
          checkedIds={selectedRepos}
          onChange={(ids) => setRepos(ids)}
        />
      </div>
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold">Dependency Contribution to Ethereum</h2>
          <p className="text-gray-600">By Repository</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            {/* min-width keeps structure for scroll */}
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dependency
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Repository
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current Weight
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Predicted Weight
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Difference
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 text-sm">
              {processedRows.map((row) => {
                const {
                  outcomeId,
                  dependency,
                  repo,
                  currentPrice,
                  predictedWeight,
                  difference,
                  balance,
                } = row;

                if (repo === "Invalid result" || dependency === "Invalid result") return null;

                return (
                  <tr key={outcomeId} className="hover:bg-gray-50">
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                      <div
                        className="text-gray-900 max-w-[120px] sm:max-w-xs truncate"
                        title={dependency}
                      >
                        {dependency}
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">{repo}</td>

                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                      {isLoadingBalances ? (
                        <div className="animate-pulse">
                          <div className="h-4 bg-gray-300 rounded w-16 sm:w-20"></div>
                        </div>
                      ) : (
                        <div className="text-gray-900">
                          {typeof balance === "bigint"
                            ? Number(formatUnits(balance, DECIMALS)).toFixed(2)
                            : "-"}
                        </div>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap font-mono">
                      {currentPrice?.toFixed(8) ?? "-"}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap font-mono">
                      {predictedWeight?.toFixed(8) ?? "-"}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                      {difference ? (
                        <span
                          className={`font-medium font-mono ${
                            difference > 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {difference > 0 ? "+" : ""}
                          {difference.toFixed(8)}
                        </span>
                      ) : (
                        <span className="text-gray-900 font-mono">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="my-5">
          <MarketsPagination
            pageCount={pageCount}
            handlePageClick={({ selected }) => setPageIndex(selected)}
            page={pageIndex + 1}
          />
        </div>
      </div>
    </>
  );
};
