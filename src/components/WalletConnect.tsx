import { useAppKit } from "@reown/appkit/react";
import React from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export const WalletConnect: React.FC = () => {
  const { address, isConnected, isConnecting } = useAccount();
  const { error } = useConnect();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();

  if (isConnecting) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span className="text-sm text-gray-600">Connecting...</span>
      </div>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm text-gray-700 font-medium">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="bg-red-500 text-white px-3 py-1.5 rounded-md hover:bg-red-600 transition-colors text-sm font-medium"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end space-y-2">
      {error && <p className="text-red-600 text-xs">Connection failed</p>}
      <button
        onClick={() => open({ view: "Connect" })}
        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
      >
        Connect Wallet
      </button>
    </div>
  );
};
