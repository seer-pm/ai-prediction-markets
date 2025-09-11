import React from "react";
import { WalletConnect } from "./WalletConnect";

export const WalletPrompt: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-8 text-center">
          <div className="mx-auto w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">AI Prediction Markets</h1>
          <p className="text-blue-100">Connect your wallet to get started</p>
        </div>

        {/* Content */}
        <div className="px-6 py-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Wallet Required</h2>
            <p className="text-gray-600 mb-4">
              To use the AI prediction markets platform, you need to connect your Web3 wallet.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center text-sm text-gray-600">
              <svg
                className="w-5 h-5 text-green-500 mr-3 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Upload and analyze your prediction CSV files
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <svg
                className="w-5 h-5 text-green-500 mr-3 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Execute trades with sUSDS tokens
            </div>
          </div>

          {/* Connect Button */}
          <div className="flex justify-center">
            <WalletConnect />
          </div>

          {/* Security Note */}
          <div className="mt-6 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-start">
              <svg
                className="w-4 h-4 text-gray-400 mt-0.5 mr-2 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-xs text-gray-600">
                Your wallet connection is secure and we never store your private keys. You maintain
                full control of your funds.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
