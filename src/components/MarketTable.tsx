import { TableData } from "@/types";
import { DECIMALS } from "@/utils/constants";
import React from "react";
import { formatUnits } from "viem";

interface MarketTableProps {
  markets: TableData[];
  isLoading: boolean;
  isLoadingBalances: boolean;
}

export const MarketTable: React.FC<MarketTableProps> = ({
  markets,
  isLoading,
  isLoadingBalances,
}) => {
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

  if (markets.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-6 border-b">
        <h2 className="text-2xl font-bold">Repository Contribution to Ethereum</h2>
        <p className="text-gray-600">Repositories ranked by current weight</p>
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
                Parent
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
            {markets.map((market) => {
              const { marketId, repo, parent, currentPrice, predictedWeight, difference, balance } =
                market;

              if (repo === "Invalid result") return null;

              return (
                <tr key={marketId} className="hover:bg-gray-50">
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
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap">{parent ?? "-"}</td>
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
    </div>
  );
};
