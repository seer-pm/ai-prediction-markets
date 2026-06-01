import { TableData } from "@/types";
import { DECIMALS } from "@/utils/constants";
import React, { useState } from "react";
import { formatUnits } from "viem";
import MarketsPagination from "./MarketsPagination";

const PAGE_SIZE = 50;

interface MarketTableProps {
  rows: TableData[];
  isLoading: boolean;
  isLoadingBalances: boolean;
}

const MarketTableInner: React.FC<MarketTableProps> = ({
  rows,
  isLoading,
  isLoadingBalances,
}) => {
  const [pageIndex, setPageIndex] = useState(0);

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

  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const processedRows = rows.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-6 border-b">
        <h2 className="text-2xl font-bold">Repository Contribution to Ethereum</h2>
        <p className="text-gray-600">Repositories ranked by resolved weight</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          {/* min-width keeps structure for scroll */}
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Repository
              </th>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Balance
              </th>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Resolved Weight
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 text-sm">
            {processedRows.map((row) => {
              const { outcomeId, repo, payout, balance } = row;

              if (repo === "Invalid result") return null;

              return (
                <tr key={outcomeId} className="hover:bg-gray-50">
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                    <div className="text-gray-900 max-w-[120px] sm:max-w-xs truncate" title={repo}>
                      {repo}
                    </div>
                  </td>
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
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                    {payout?.toFixed(8) ?? "-"}
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
  );
};

export const MarketTable = React.memo(MarketTableInner);
