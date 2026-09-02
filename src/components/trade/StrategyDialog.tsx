import { AmountInput, Button, Dialog, ErrorPanel, Panel } from "@/components/ui";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { DepositInterface } from "./DepositInterface";
import type { TxProgressState } from "@/hooks/useTxProgress";
import { cn } from "@/utils/cn";
import { collateral } from "@/utils/constants";
import { formatAmount, safeParseUnits } from "@/utils/format";
import { STRATEGY_PHASES, runStatus } from "@/utils/txPhases";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { formatUnits } from "viem";
import { RunLedger } from "./RunLedger";

export interface PreflightStat {
  label: string;
  value: string;
  tone?: "long" | "short" | "neutral";
}

export interface StrategyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Counts computed from the loaded rows — what this run will actually do. */
  stats: PreflightStat[];
  /** The step-by-step explanation, moved behind a disclosure. */
  howItWorks: ReactNode;
  balance?: { value: bigint; decimals: number };
  balanceLoading?: boolean;
  /** Quote fetching, when the contest needs it before executing. */
  quotesLoading?: boolean;
  quotesProgress?: { step: number; of: number };
  quotesError?: unknown;
  balancesLoading?: boolean;
  mutation: {
    isPending: boolean;
    isError: boolean;
    isSuccess: boolean;
    error: unknown;
    reset: () => void;
    progress: TxProgressState;
  };
  onSubmit: (amount: string) => void;
  /**
   * Called as the field changes, not on submit. Quotes depend on the amount,
   * so the owner has to see it while it is being typed — this dialog owns the
   * form, and without this the parent only learned the amount once it was too
   * late to price anything with it.
   */
  onAmountChange?: (amount: string) => void;
  /** Extra reason the run can't start, beyond the built-in ones. */
  blockedReason?: string;
}

interface FormValues {
  amount: string;
}

const TONES = {
  long: "text-long",
  short: "text-short",
  neutral: "text-ink",
} as const;

/**
 * The strategy review dialog, shared by all four contests.
 *
 * Replaces a wall of nested prose with the numbers the run will act on, and a
 * ledger that shows the run happening rather than one line of overwritten
 * status text. The amount is optional throughout — you can trade purely from
 * tokens you already hold.
 */
export function StrategyDialog({
  open,
  onOpenChange,
  title,
  description,
  stats,
  howItWorks,
  balance,
  balanceLoading = false,
  quotesLoading = false,
  quotesProgress,
  quotesError,
  balancesLoading = false,
  mutation,
  onSubmit,
  onAmountChange,
  blockedReason,
}: StrategyDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormValues>({ mode: "onChange", defaultValues: { amount: "" } });

  const amount = watch("amount");
  useEffect(() => {
    onAmountChange?.(amount);
  }, [amount, onAmountChange]);

  const formId = useId();
  const { account, tradeExecutor } = useTradeWalletStatus();
  const [depositOpen, setDepositOpen] = useState(false);

  // Reset only on dismissal — the finished ledger has to survive the run.
  useEffect(() => {
    if (!open) {
      reset();
      mutation.progress.reset();
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  const status = runStatus(mutation);
  const maxValue = balance ? formatUnits(balance.value, balance.decimals) : undefined;

  const disabledReason = (() => {
    if (mutation.isPending) return undefined;
    if (balancesLoading) return "Still reading your current balances.";
    if (quotesLoading) return "Still fetching quotes from the pools.";
    if (quotesError) return "Quotes could not be fetched — dismiss the error and reopen.";
    if (errors.amount) return errors.amount.message;
    return blockedReason;
  })();

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="md"
      dismissible={!mutation.isPending}
      footer={
        status === "succeeded" ? (
          <Button variant="primary" onClick={() => onOpenChange(false)} fullWidth>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending} fullWidth>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              loading={mutation.isPending}
              disabled={mutation.isPending || !!disabledReason}
              disabledReason={disabledReason}
              fullWidth
            >
              Execute strategy
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {mutation.isError && (
          <ErrorPanel title="The run stopped" error={mutation.error} onDismiss={mutation.reset} />
        )}
        {!!quotesError && <ErrorPanel title="Quotes could not be fetched" error={quotesError} />}

        {status === "succeeded" && (
          <Panel tone="success" title="Strategy executed">
            Your positions now reflect the predictions you uploaded. Balances refresh in a moment.
          </Panel>
        )}

        {status !== "idle" && (
          <RunLedger
            phases={STRATEGY_PHASES}
            current={mutation.progress.current}
            completed={mutation.progress.completed}
            skipped={mutation.progress.skipped}
            status={status}
          />
        )}

        {/* Preflight: what this run will do, in numbers */}
        {status !== "succeeded" && (
        <dl className="grid grid-cols-2 divide-x divide-y divide-rule overflow-hidden rounded-lg border border-rule sm:grid-cols-4 sm:divide-y-0">
          {stats.map((stat) => (
            <div key={stat.label} className="px-4 py-3">
              <dt className="text-label font-semibold tracking-wider text-ink-3 uppercase">
                {stat.label}
              </dt>
              <dd className={cn("mt-1 font-mono text-title font-bold", TONES[stat.tone ?? "neutral"])}>
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        )}

        {balancesLoading && status !== "succeeded" && (
          <Panel tone="working" title="Reading your current balances">
            Positions you already hold count towards the strategy.
          </Panel>
        )}

        {quotesLoading && status !== "succeeded" && (
          <Panel
            tone="working"
            title={
              quotesProgress && quotesProgress.of > 0
                ? `Pricing ${quotesProgress.step} of ${quotesProgress.of} markets`
                : "Pricing the markets"
            }
          >
            Quotes come from the pools one market at a time. This can take a minute on a large file.
          </Panel>
        )}

        {status !== "succeeded" && (
        <form id={formId} onSubmit={handleSubmit(({ amount }) => onSubmit(amount))} noValidate>
          <AmountInput
            label={`Mint new positions with (optional)`}
            unit={collateral.symbol}
            placeholder="0.00"
            disabled={mutation.isPending || balancesLoading}
            balance={
              balance
                ? formatAmount(Number(formatUnits(balance.value, balance.decimals)))
                : undefined
            }
            balanceLoading={balanceLoading}
            onMax={maxValue ? () => setValue("amount", maxValue, { shouldValidate: true }) : undefined}
            error={errors.amount?.message}
            hint={
              <>
                Leave empty to trade only with outcome tokens you already hold.
                {account && tradeExecutor && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => setDepositOpen(true)}
                      className="cursor-pointer font-semibold text-primary underline underline-offset-2 hover:text-primary-hover"
                    >
                      Deposit more {collateral.symbol}
                    </button>
                  </>
                )}
              </>
            }
            {...register("amount", {
              validate: (value) => {
                if (!value) return true;
                const parsed = safeParseUnits(value, balance?.decimals ?? 18);
                if (parsed <= 0n) return "Enter a positive amount, or leave this empty.";
                if (parsed > (balance?.value ?? 0n)) {
                  const available = balance
                    ? formatAmount(Number(formatUnits(balance.value, balance.decimals)))
                    : "0.00";
                  return `That is more than the trade wallet's ${available} ${collateral.symbol}.`;
                }
                return true;
              },
            })}
          />
        </form>
        )}

        <details className="group rounded-lg border border-rule bg-sunken">
          <summary className="cursor-pointer list-none px-4 py-3 text-body font-semibold text-ink marker:hidden">
            How this strategy works
            <span className="float-right text-ink-4 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="border-t border-rule px-4 py-4 text-body text-ink-2">{howItWorks}</div>
        </details>
      </div>
    </Dialog>

      {/* Running short mid-review shouldn't mean closing the dialog, topping up
          and starting over — this opens over it and returns you here. */}
      {account && tradeExecutor && (
        <DepositInterface
          open={depositOpen}
          onOpenChange={setDepositOpen}
          account={account}
          tradeExecutor={tradeExecutor}
        />
      )}
    </>
  );
}
