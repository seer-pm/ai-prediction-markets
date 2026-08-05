import { cn } from "@/utils/cn";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Skeleton } from "./Skeleton";

interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: string;
  /** Right-hand side of the label row — balance readouts, Max, etc. */
  aside?: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, children, hint, error, aside, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={htmlFor} className="text-body font-medium text-ink">
          {label}
        </label>
        {aside && <div className="flex items-center gap-3 text-body text-ink-3">{aside}</div>}
      </div>
      {children}
      {/* Errors live under the field, never inside the submit button. */}
      {error ? (
        <p className="text-body text-short">{error}</p>
      ) : hint ? (
        <p className="text-body text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export interface AmountInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  label: ReactNode;
  unit?: string;
  hint?: ReactNode;
  error?: string;
  /** Formatted balance string, or undefined while loading. */
  balance?: string;
  balanceLoading?: boolean;
  onMax?: () => void;
}

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { label, unit, hint, error, balance, balanceLoading, onMax, className, disabled, ...rest },
  ref,
) {
  const id = useId();

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      aside={
        balance !== undefined || balanceLoading ? (
          <>
            <span className="text-ink-3">
              Balance{" "}
              {balanceLoading ? (
                <Skeleton className="ml-1 inline-block align-middle" width={60} height={13} />
              ) : (
                <span className="font-mono text-ink-2">
                  {balance}
                  {unit ? ` ${unit}` : ""}
                </span>
              )}
            </span>
            {onMax && (
              <button
                type="button"
                onClick={onMax}
                disabled={disabled || balanceLoading}
                className="cursor-pointer text-body font-semibold text-primary transition-colors hover:text-primary-hover disabled:cursor-not-allowed disabled:opacity-45"
              >
                Max
              </button>
            )}
          </>
        ) : undefined
      }
    >
      <div
        className={cn(
          "flex items-center rounded-md border bg-surface transition-colors",
          error
            ? "border-short ring-2 ring-short-rule"
            : "border-rule-strong focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-rule",
          disabled && "bg-sunken",
        )}
      >
        <input
          ref={ref}
          id={id}
          type="number"
          step="any"
          inputMode="decimal"
          disabled={disabled}
          aria-invalid={!!error}
          className={cn(
            "min-w-0 flex-1 bg-transparent p-4 font-mono text-lede text-ink outline-none placeholder:font-sans placeholder:text-ink-4 disabled:cursor-not-allowed",
            className,
          )}
          {...rest}
        />
        {unit && (
          <span className="shrink-0 border-l border-rule px-4 py-4 text-body font-medium text-ink-3">
            {unit}
          </span>
        )}
      </div>
    </Field>
  );
});

/** Plain text input matching the amount field's shell. */
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body text-ink transition-colors outline-none placeholder:text-ink-4 focus:border-primary focus:ring-2 focus:ring-primary-rule disabled:cursor-not-allowed disabled:bg-sunken",
          className,
        )}
        {...rest}
      />
    );
  },
);
