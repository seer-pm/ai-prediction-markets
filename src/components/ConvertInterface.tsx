import { useConvertToAssets, useConvertToShares } from "@/hooks/useConvertSavingsTokens";
import { useSupplyAsset } from "@/hooks/useSupplySavingsTokens";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useWithdrawAsset } from "@/hooks/useWithdrawSavingsTokens";
import { Token } from "@/types";
import { CHAIN_ID, collateral, COLLATERAL_TOKENS, DECIMALS } from "@/utils/constants";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Address, formatUnits, parseUnits } from "viem";
import { ErrorPanel } from "./trade/ErrorPanel";

const STORAGE_KEY = "convert_selected_asset";

interface ConvertInterfaceProps {
  onClose: () => void;
  account: Address;
}

interface ConvertFormData {
  amount: string;
  asset: Address;
  use7702: boolean;
}

export const ConvertInterface: React.FC<ConvertInterfaceProps> = ({ onClose, account }) => {
  const [activeTab, setActiveTab] = useState("supply");

  const tabs = [
    { id: "supply", label: "Supply" },
    { id: "withdraw", label: "Withdraw" },
  ];

  const assets = COLLATERAL_TOKENS[CHAIN_ID].swap as Token[];

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset: _,
    watch,
    setValue,
    setError,
  } = useForm<ConvertFormData>({
    mode: "all",
    defaultValues: {
      amount: "",
      asset:
        typeof window !== "undefined"
          ? ((localStorage.getItem(STORAGE_KEY) as Address) ?? assets[1].address)
          : assets[1].address,
      use7702: false,
    },
  });

  const [amount, asset, use7702] = watch(["amount", "asset", "use7702"]);
  const currentAsset = assets.find((a) => a.address === asset);
  // Get asset/sUSDS balance
  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: account,
    token: activeTab === "supply" ? asset : collateral.address,
  });
  const balance = balanceData && formatUnits(balanceData.value, balanceData.decimals);

  const { data: toSharesData, isLoading: isLoadingShares } = useConvertToShares({
    asset,
    amount: currentAsset && activeTab === "supply" ? parseUnits(amount, currentAsset.decimals) : 0n,
  });

  const { data: toAssetsData, isLoading: isLoadingAssets } = useConvertToAssets({
    asset,
    amount: currentAsset && activeTab === "withdraw" ? parseUnits(amount, collateral.decimals) : 0n,
  });
  const convertAmount =
    activeTab === "supply"
      ? Number(formatUnits(toSharesData ?? 0n, collateral.decimals)).toFixed(4)
      : Number(formatUnits(toAssetsData ?? 0n, currentAsset?.decimals ?? DECIMALS)).toFixed(4);

  const supplyAsset = useSupplyAsset(() => {
    // onClose();
    setValue("amount", "");
  });

  const withdrawAsset = useWithdrawAsset(() => {
    // onClose();
    setValue("amount", "");
  });

  const mutation = activeTab === "supply" ? supplyAsset : withdrawAsset;

  React.useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && assets.some((a) => a.address === saved)) {
      setValue("asset", saved as Address);
    }
  }, []);

  React.useEffect(() => {
    if (asset) {
      localStorage.setItem(STORAGE_KEY, asset);
    }
  }, [asset]);

  const onSubmit = ({ amount }: ConvertFormData) => {
    if (!currentAsset) return;
    if (activeTab === "supply") {
      return supplyAsset.mutate({
        amount: parseUnits(amount, currentAsset.decimals),
        convertAmount: ((toSharesData ?? 0n) * 99n) / 100n,
        asset,
        use7702,
      });
    }
    return withdrawAsset.mutate({
      amount: parseUnits(amount, collateral.decimals),
      asset,
      use7702,
      convertAmount: ((toAssetsData ?? 0n) * 99n) / 100n,
      convertToken: currentAsset.symbol,
    });
  };

  const handleMaxClick = () => {
    if (balance) {
      setValue("amount", balance, { shouldValidate: true });
    }
  };
  return (
    <div className="max-h-[90vh] overflow-y-auto">
      {/* Header with Close Button */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Convert sUSDS</h3>
          <p className="text-sm text-white">Turn USDS or USDC into sUSDS or vice versa</p>
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
        {mutation.isError && (
          <ErrorPanel
            title="Convert Failed"
            description={mutation.error?.message}
            onDismiss={mutation.reset}
          />
        )}
        <div className="w-[300px] flex gap-10 border-b border-gray-300">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id !== activeTab) {
                  setValue("amount", "");
                  setError("amount", {});
                }
              }}
              className={`cursor-pointer flex-1 py-2 text-center font-medium whitespace-nowrap
              ${
                activeTab === tab.id
                  ? "border-b-2 border-blue-500 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === "supply" ? (
          <div>
            Turn{" "}
            <select
              {...register("asset")}
              className="border border-blue-500 rounded py-1 px-2 outline-none"
            >
              {assets.map((a) => (
                <option key={a.address} value={a.address}>
                  {a.symbol}
                </option>
              ))}
            </select>{" "}
            into sUSDS
          </div>
        ) : (
          <div>
            Turn sUSDS into{" "}
            <select
              {...register("asset")}
              className="border border-blue-500 rounded py-1 px-2 outline-none"
            >
              {assets.map((a) => (
                <option key={a.address} value={a.address}>
                  {a.symbol}
                </option>
              ))}
            </select>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="mb-4">
            {/* Balance Display */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Balance:{" "}
                {isBalanceLoading ? (
                  <span className="animate-pulse">Loading...</span>
                ) : (
                  <span className="font-mono text-gray-900">
                    {balance ? Number(balance).toFixed(2) : 0}{" "}
                    {activeTab === "supply" ? (currentAsset?.symbol ?? "") : collateral.symbol}
                  </span>
                )}
              </span>
              {!isBalanceLoading && (
                <button
                  type="button"
                  onClick={handleMaxClick}
                  className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-medium"
                  disabled={mutation.isPending}
                >
                  Max
                </button>
              )}
            </div>

            <input
              {...register("amount", {
                required: "Amount is required",
                validate: (value) =>
                  parseUnits(
                    value,
                    activeTab === "supply"
                      ? (currentAsset?.decimals ?? DECIMALS)
                      : collateral.decimals,
                  ) <= (balanceData?.value ?? 0n) || "Not enough balance",
              })}
              type="number"
              step="any"
              placeholder="0"
              className="mb-2 w-full p-4 text-lg border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={mutation.isPending}
            />
            {!!amount && !isLoadingShares && !isLoadingAssets && (
              <p className="text-sm">
                You will receive {convertAmount}{" "}
                {activeTab === "supply" ? collateral.symbol : (currentAsset?.symbol ?? "")}
              </p>
            )}
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
              type="submit"
              className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={mutation.isPending || !!errors.amount || !amount}
            >
              {errors.amount?.message ?? tabs.find((tab) => tab.id === activeTab)?.label ?? ""}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
