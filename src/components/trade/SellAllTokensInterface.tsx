import { InfoCircleIcon } from "@/lib/icons";
import React from "react";
import { ErrorPanel } from "./ErrorPanel";
import { LoadingPanel } from "./LoadingPanel";

export interface SellAllTokensInterfaceProps {
  onClose: () => void;
  /** Subtitle shown below the header. L1 uses "using direct swaps", others use a simpler string. */
  subtitle?: string;
  /** Whether the sell mutation has errored */
  isError: boolean;
  /** The error from the sell mutation */
  error: Error | null;
  /** Whether the sell mutation is pending */
  isPending: boolean;
  /** Current transaction state description */
  txState: string;
  /** Reset the sell mutation state */
  reset: () => void;
  /** Execute the sell */
  onSellAll: () => void;
  /** True while balances or table data is still loading */
  isLoading: boolean;
  /** True if there are tokens to sell */
  hasTokens: boolean;
}

export const SellAllTokensInterface: React.FC<SellAllTokensInterfaceProps> = ({
  onClose,
  subtitle = "Sell all positions to sUSDS",
  isError,
  error,
  isPending,
  txState,
  reset,
  onSellAll,
  isLoading,
  hasTokens,
}) => {
  return (
    <div className="max-h-[90vh] overflow-y-auto">
      {/* Header with Close Button */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Sell all outcome tokens</h3>
          <p className="text-sm text-white">{subtitle}</p>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer text-white hover:text-gray-200 p-2 hover:bg-white hover:bg-opacity-10 rounded-full transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="px-6 py-4 space-y-4">
        {isError && (
          <ErrorPanel
            title="Sell Tokens Failed"
            description={error?.message ?? "Unknown error"}
            onDismiss={reset}
          />
        )}
        {isPending && (
          <LoadingPanel title="Selling tokens" description={txState} />
        )}
        {isLoading ? (
          <p>Checking balances...</p>
        ) : !hasTokens ? (
          <p>Nothing to sell</p>
        ) : (
          <>
            <div className="flex items-center gap-4 p-4 border rounded-[4px] border-[#FF9900]">
              <InfoCircleIcon width="24" height="24" />
              <div className="space-y-3">
                <p>
                  Selling everything at once may result in significant slippage, causing you to
                  receive much less than expected. Proceed with caution.
                </p>
              </div>
            </div>
            <div className="flex space-x-4 mb-2">
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer flex-1 bg-gray-300 text-gray-700 py-4 px-6 rounded-md hover:bg-gray-400 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSellAll}
                className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isPending}
              >
                {isPending ? "Executing..." : "Sell"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
