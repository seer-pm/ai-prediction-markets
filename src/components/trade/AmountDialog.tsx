import { AmountInput, Button, Dialog, ErrorPanel } from "@/components/ui";
import { formatAmount } from "@/utils/format";
import { useEffect, useId, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { formatUnits, parseUnits } from "viem";

export interface AmountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Balance the amount is validated against. */
  balance?: { value: bigint; decimals: number };
  balanceLoading?: boolean;
  unit: string;
  submitLabel: string;
  errorTitle: string;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onReset: () => void;
  onSubmit: (amount: string) => void;
  /** Shown above the form — e.g. the "no sUSDS?" conversion link. */
  intro?: ReactNode;
  hint?: ReactNode;
}

interface FormValues {
  amount: string;
}

/**
 * Deposit and withdraw were the same 90 lines twice over, each with the
 * validation message rendered inside the submit button. One dialog now, with
 * errors under the field and a label that never changes.
 */
export function AmountDialog({
  open,
  onOpenChange,
  title,
  description,
  balance,
  balanceLoading = false,
  unit,
  submitLabel,
  errorTitle,
  isPending,
  isError,
  error,
  onReset,
  onSubmit,
  intro,
  hint,
}: AmountDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
    setValue,
  } = useForm<FormValues>({ mode: "onChange", defaultValues: { amount: "" } });

  const formId = useId();

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const max = balance ? formatUnits(balance.value, balance.decimals) : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      dismissible={!isPending}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={isPending} fullWidth>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={isPending}
            disabled={isPending || !isValid}
            fullWidth
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {intro}
        {isError && <ErrorPanel title={errorTitle} error={error} onDismiss={onReset} />}

        <form
          id={formId}
          onSubmit={handleSubmit(({ amount }) => onSubmit(amount))}
          noValidate
        >
          <AmountInput
            label="Amount"
            unit={unit}
            placeholder="0.00"
            autoFocus
            disabled={isPending}
            balance={balance ? formatAmount(Number(formatUnits(balance.value, balance.decimals))) : undefined}
            balanceLoading={balanceLoading}
            onMax={max ? () => setValue("amount", max, { shouldValidate: true }) : undefined}
            error={errors.amount?.message}
            hint={hint}
            {...register("amount", {
              required: "Enter an amount.",
              validate: (value) => {
                let parsed: bigint;
                try {
                  parsed = parseUnits(value, balance?.decimals ?? 18);
                } catch {
                  return "Enter a valid number.";
                }
                if (parsed <= 0n) return "Enter an amount greater than zero.";
                if (parsed > (balance?.value ?? 0n)) {
                  const available = balance
                    ? formatAmount(Number(formatUnits(balance.value, balance.decimals)))
                    : "0.00";
                  return `That is more than your ${available} ${unit} balance.`;
                }
                return true;
              },
            })}
          />
        </form>
      </div>
    </Dialog>
  );
}
