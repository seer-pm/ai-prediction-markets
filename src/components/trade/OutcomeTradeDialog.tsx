import { AmountInput, Button, Dialog, ErrorPanel, Panel, Skeleton } from "@/components/ui";
import useDebounce from "@/hooks/useDebounce";
import { quoteOutcomeTrade, useTradeOutcome } from "@/hooks/useTradeOutcome";
import { DECIMALS, collateral } from "@/utils/constants";
import { formatAmount } from "@/utils/format";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";
import { Address, formatUnits, parseUnits } from "viem";

/** Applied by `getUniswapTradeExecution`; surfaced here so the preview is not read as a guarantee. */
const SLIPPAGE_PERCENT = 0.5;

export interface OutcomeTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: "buy" | "sell";
  tradeExecutor: Address;
  outcomeLabel: string;
  outcomeToken: Address;
  outcomeSymbol: string;
  collateralToken: Address;
  /** Outcome tokens held by the trade wallet — the ceiling on a sell. */
  outcomeBalance: bigint;
  /** sUSDS held by the trade wallet — the ceiling on a buy. */
  collateralBalance: bigint;
  balanceLoading?: boolean;
  /** Current pool price of this outcome, for the "vs market" comparison. */
  price: number | null;
}

interface FormValues {
  amount: string;
}

/**
 * Buy or sell one outcome.
 *
 * `AmountDialog` is the closest existing thing but has no quote, and a prediction market trade
 * without a preview asks the user to sign for an unknown number of shares — so this is a sibling of
 * it rather than a wrapper. What it does borrow is the shape: one validated amount, errors under
 * the field, and a label that does not change while pending.
 *
 * The unit flips with the side. Buying spends sUSDS and receives shares; selling spends shares and
 * receives sUSDS. Both sides of every pool in this contest are 18-decimal.
 */
export function OutcomeTradeDialog({
  open,
  onOpenChange,
  side,
  tradeExecutor,
  outcomeLabel,
  outcomeToken,
  outcomeSymbol,
  collateralToken,
  outcomeBalance,
  collateralBalance,
  balanceLoading = false,
  price,
}: OutcomeTradeDialogProps) {
  const isBuy = side === "buy";
  const spendUnit = isBuy ? collateral.symbol : "shares";
  const receiveUnit = isBuy ? "shares" : collateral.symbol;
  const spendBalance = isBuy ? collateralBalance : outcomeBalance;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid },
    reset,
    setValue,
  } = useForm<FormValues>({ mode: "onChange", defaultValues: { amount: "" } });

  const formId = useId();
  const amount = watch("amount");
  const debouncedAmount = useDebounce(amount, 300);
  // The debounce means the quote on hand can belong to a previous amount.
  const quoteStale = amount !== debouncedAmount;

  const trade = useTradeOutcome(() => onOpenChange(false));

  // Reset the form *and* the mutation when the dialog closes, so reopening starts clean rather
  // than showing the previous run's error.
  useEffect(() => {
    if (!open) {
      reset();
      trade.reset();
      trade.progress.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const quotable = (() => {
    if (!debouncedAmount) return false;
    try {
      return parseUnits(debouncedAmount, DECIMALS) > 0n;
    } catch {
      return false;
    }
  })();

  const {
    data: quote,
    isFetching: quoteLoading,
    error: quoteError,
  } = useQuery({
    enabled: open && quotable,
    retry: false,
    refetchOnWindowFocus: false,
    // A preview is only worth as much as it is fresh, but re-quoting on every remount would fire a
    // QuoterV2 read per keystroke pause. 15s is well inside how long a pool price stays useful.
    staleTime: 15 * 1000,
    queryKey: ["quoteOutcomeTrade", tradeExecutor, outcomeToken, side, debouncedAmount],
    queryFn: () =>
      quoteOutcomeTrade({
        tradeExecutor,
        outcomeToken,
        outcomeSymbol,
        collateralToken,
        amount: debouncedAmount,
        side,
      }),
  });

  const received = quote ? Number(formatUnits(quote.value, DECIMALS)) : undefined;
  const spent = Number(debouncedAmount || 0);
  // Cost of one share, whichever direction the trade runs. Directly comparable to the pool price
  // beside it, which is the point: the gap is the fee plus the impact of this trade's own size.
  const effectivePrice =
    received && spent ? (isBuy ? spent / received : received / spent) : undefined;
  const minimumReceived = received ? received * (1 - SLIPPAGE_PERCENT / 100) : undefined;

  const max = formatUnits(spendBalance, DECIMALS);

  // `getUniswapQuoteFast` throws this when no fee tier has a pool. Worth naming, because the raw
  // string reads like a routing bug rather than an unseeded outcome.
  const noRoute = quoteError instanceof Error && quoteError.message === "No route found";

  const blockedReason = quoteStale
    ? "Pricing the new amount…"
    : quoteLoading
      ? "Fetching a quote…"
      : noRoute
        ? "This outcome has no liquidity to trade against."
        : quoteError
          ? "A quote could not be fetched. Try again."
          : !quote
            ? "Enter an amount to price the trade."
            : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${isBuy ? "Buy" : "Sell"} “${outcomeLabel}”`}
      description={
        isBuy
          ? `Spends ${collateral.symbol} from your trade wallet and receives outcome shares.`
          : `Sells outcome shares from your trade wallet back to ${collateral.symbol}.`
      }
      size="sm"
      dismissible={!trade.isPending}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={trade.isPending} fullWidth>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={isBuy ? "primary" : "secondary"}
            loading={trade.isPending}
            disabled={trade.isPending || !isValid || !!blockedReason}
            disabledReason={!trade.isPending && isValid ? blockedReason : undefined}
            fullWidth
          >
            {isBuy ? "Buy shares" : "Sell shares"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {trade.isError && (
          <ErrorPanel
            title="The trade could not be completed"
            error={trade.error}
            onDismiss={trade.reset}
          />
        )}

        <form
          id={formId}
          noValidate
          onSubmit={handleSubmit(({ amount: value }) =>
            trade.mutate({
              tradeExecutor,
              outcomeToken,
              outcomeSymbol,
              collateralToken,
              amount: value,
              side,
            }),
          )}
        >
          <AmountInput
            label={isBuy ? `Spend` : `Sell`}
            unit={spendUnit}
            placeholder="0.00"
            autoFocus
            disabled={trade.isPending}
            balance={formatAmount(Number(max))}
            balanceLoading={balanceLoading}
            onMax={() => setValue("amount", max, { shouldValidate: true })}
            error={errors.amount?.message}
            {...register("amount", {
              required: "Enter an amount.",
              validate: (value) => {
                let parsed: bigint;
                try {
                  parsed = parseUnits(value, DECIMALS);
                } catch {
                  return "Enter a valid number.";
                }
                if (parsed <= 0n) return "Enter an amount greater than zero.";
                if (parsed > spendBalance) {
                  return `That is more than your ${formatAmount(Number(max))} ${spendUnit} balance.`;
                }
                return true;
              },
            })}
          />
        </form>

        {noRoute ? (
          <Panel tone="info" title="Not tradable">
            This outcome has no liquidity pool, so there is nothing to trade against. It can still be
            redeemed once the market settles.
          </Panel>
        ) : (
          <dl className="space-y-2 rounded-md bg-sunken px-4 py-3 text-body">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-3">You receive ≈</dt>
              <dd className="font-mono font-semibold text-ink">
                {quoteLoading || quoteStale ? (
                  <Skeleton width={90} height={14} />
                ) : received !== undefined ? (
                  `${formatAmount(received)} ${receiveUnit}`
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-3">Price per share</dt>
              <dd className="font-mono text-ink-2">
                {effectivePrice !== undefined ? effectivePrice.toFixed(4) : "—"}
                {price !== null && (
                  <span className="ml-1.5 text-ink-4">(market {price.toFixed(4)})</span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-3">Minimum received</dt>
              <dd className="font-mono text-ink-2">
                {minimumReceived !== undefined
                  ? `${formatAmount(minimumReceived)} ${receiveUnit}`
                  : "—"}
                <span className="ml-1.5 text-ink-4">({SLIPPAGE_PERCENT}% slippage)</span>
              </dd>
            </div>
          </dl>
        )}
      </div>
    </Dialog>
  );
}
