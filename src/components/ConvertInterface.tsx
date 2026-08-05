import { AmountInput, Button, Dialog, ErrorPanel, Select } from "@/components/ui";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useConvertToAssets, useConvertToShares } from "@/hooks/useConvertSavingsTokens";
import { useSupplyAsset } from "@/hooks/useSupplySavingsTokens";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useWithdrawAsset } from "@/hooks/useWithdrawSavingsTokens";
import { Token } from "@/types";
import { CHAIN_ID, collateral, COLLATERAL_TOKENS, DECIMALS } from "@/utils/constants";
import { formatAmount, safeParseUnits } from "@/utils/format";
import React, { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { Address, formatUnits, parseUnits } from "viem";

const STORAGE_KEY = "convert_selected_asset";

const MODES = [
  { id: "supply", label: "Buy sUSDS" },
  { id: "withdraw", label: "Sell sUSDS" },
];

interface ConvertInterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Address;
}

interface ConvertFormData {
  amount: string;
  asset: Address;
}

export const ConvertInterface: React.FC<ConvertInterfaceProps> = ({
  open,
  onOpenChange,
  account,
}) => {
  const [mode, setMode] = useState("supply");
  const formId = useId();
  const isSupply = mode === "supply";
  const assets = COLLATERAL_TOKENS[CHAIN_ID].swap as Token[];

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
    setValue,
  } = useForm<ConvertFormData>({
    mode: "onChange",
    defaultValues: {
      amount: "",
      asset:
        typeof window !== "undefined"
          ? ((localStorage.getItem(STORAGE_KEY) as Address) ?? assets[1].address)
          : assets[1].address,
    },
  });

  const [amount, asset] = watch(["amount", "asset"]);
  const currentAsset = assets.find((token) => token.address === asset);
  const inputDecimals = isSupply ? (currentAsset?.decimals ?? DECIMALS) : collateral.decimals;
  const inputSymbol = isSupply ? (currentAsset?.symbol ?? "") : collateral.symbol;
  const outputSymbol = isSupply ? collateral.symbol : (currentAsset?.symbol ?? "");

  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: account,
    token: isSupply ? asset : collateral.address,
  });

  const parsedAmount = safeParseUnits(amount, inputDecimals);

  const { data: toSharesData, isLoading: isLoadingShares } = useConvertToShares({
    asset,
    amount: isSupply ? parsedAmount : 0n,
  });
  const { data: toAssetsData, isLoading: isLoadingAssets } = useConvertToAssets({
    asset,
    amount: isSupply ? 0n : parsedAmount,
  });

  const receive = isSupply
    ? formatAmount(Number(formatUnits(toSharesData ?? 0n, collateral.decimals)))
    : formatAmount(Number(formatUnits(toAssetsData ?? 0n, currentAsset?.decimals ?? DECIMALS)));

  const supplyAsset = useSupplyAsset(() => setValue("amount", ""));
  const withdrawAsset = useWithdrawAsset(() => setValue("amount", ""));
  const mutation = isSupply ? supplyAsset : withdrawAsset;

  useEffect(() => {
    if (asset) localStorage.setItem(STORAGE_KEY, asset);
  }, [asset]);

  const onSubmit = ({ amount }: ConvertFormData) => {
    if (!currentAsset) return;
    if (isSupply) {
      return supplyAsset.mutate({
        amount: parseUnits(amount, currentAsset.decimals),
        convertAmount: ((toSharesData ?? 0n) * 99n) / 100n,
        asset,
        use7702: false,
      });
    }
    return withdrawAsset.mutate({
      amount: parseUnits(amount, collateral.decimals),
      asset,
      use7702: false,
      convertAmount: ((toAssetsData ?? 0n) * 99n) / 100n,
      convertToken: currentAsset.symbol,
    });
  };

  const maxValue = balanceData ? formatUnits(balanceData.value, balanceData.decimals) : undefined;
  const isQuoting = !!amount && (isLoadingShares || isLoadingAssets);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Convert sUSDS"
      description="sUSDS is the collateral every market settles in, and it earns Sky savings yield while you hold it."
      size="sm"
      dismissible={!mutation.isPending}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending} fullWidth>
            Close
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={mutation.isPending}
            disabled={mutation.isPending || !isValid}
            fullWidth
          >
            {isSupply ? "Buy sUSDS" : "Sell sUSDS"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SegmentedControl
          segments={MODES}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setValue("amount", "", { shouldValidate: false });
          }}
        />

        {mutation.isError && (
          <ErrorPanel title="Conversion failed" error={mutation.error} onDismiss={mutation.reset} />
        )}

        <div className="space-y-1.5">
          <span className="block text-body font-medium text-ink">
            {isSupply ? "Pay with" : "Receive as"}
          </span>
          <Select
            className="w-full"
            placeholder="Select a token"
            options={assets.map((token) => ({ id: token.address, text: token.symbol }))}
            selectedId={asset}
            onChange={(id) => id && setValue("asset", id as Address, { shouldValidate: true })}
          />
        </div>

        <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate>
          <AmountInput
            label="Amount"
            unit={inputSymbol}
            placeholder="0.00"
            disabled={mutation.isPending}
            balance={
              balanceData
                ? formatAmount(Number(formatUnits(balanceData.value, balanceData.decimals)))
                : undefined
            }
            balanceLoading={isBalanceLoading}
            onMax={maxValue ? () => setValue("amount", maxValue, { shouldValidate: true }) : undefined}
            error={errors.amount?.message}
            hint={
              amount && !isQuoting ? (
                <>
                  You receive{" "}
                  <span className="font-mono text-ink-2">
                    {receive} {outputSymbol}
                  </span>{" "}
                  at current rates.
                </>
              ) : isQuoting ? (
                "Checking the current rate…"
              ) : undefined
            }
            {...register("amount", {
              required: "Enter an amount.",
              validate: (value) => {
                const parsed = safeParseUnits(value, inputDecimals);
                if (parsed <= 0n) return "Enter an amount greater than zero.";
                if (parsed > (balanceData?.value ?? 0n)) {
                  const available = balanceData
                    ? formatAmount(Number(formatUnits(balanceData.value, balanceData.decimals)))
                    : "0.00";
                  return `That is more than your ${available} ${inputSymbol} balance.`;
                }
                return true;
              },
            })}
          />
        </form>
      </div>
    </Dialog>
  );
};
