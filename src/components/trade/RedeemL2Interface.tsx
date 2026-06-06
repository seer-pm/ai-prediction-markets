import { ErrorPanel } from "@/components/trade/ErrorPanel";
import { LoadingPanel } from "@/components/trade/LoadingPanel";
import React from "react";

export interface RedeemL2InterfaceProps {
  onClose: () => void;
  isError: boolean;
  error: Error | null;
  isPending: boolean;
  txState: string;
  reset: () => void;
  onRedeem: () => void;
  isLoading: boolean;
  hasRedeemable: boolean;
}

export const RedeemL2Interface: React.FC<RedeemL2InterfaceProps> = ({
  onClose,
  isError,
  error,
  isPending,
  txState,
  reset,
  onRedeem,
  isLoading,
  hasRedeemable,
}) => {
  return (
    <div className="max-h-[90vh] overflow-y-auto">
      {/* Header with Close Button */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Redeem outcome tokens</h3>
          <p className="text-sm text-white">Redeem resolved L2 positions to sUSDS</p>
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
            title="Redeem Failed"
            description={error?.message ?? "Unknown error"}
            onDismiss={reset}
          />
        )}
        {isPending && <LoadingPanel title="Redeeming tokens" description={txState} />}
        {isLoading ? (
          <p>Checking balances...</p>
        ) : !hasRedeemable ? (
          <p>Nothing to redeem</p>
        ) : (
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
              onClick={onRedeem}
              disabled={isPending}
              className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Redeeming..." : "Redeem"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
