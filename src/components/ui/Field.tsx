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

/** The kit's field (`.seer-field`): label, the control, then a hint or the error. */
export function Field({ label, htmlFor, children, hint, error, aside, className }: FieldProps) {
  return (
    <div className={cn("seer-field", className)}>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={htmlFor} className="seer-label">
          {label}
        </label>
        {aside && <div className="seer-hint flex items-center gap-3">{aside}</div>}
      </div>
      {children}
      {/* Errors live under the field, never inside the submit button. */}
      {error ? (
        <p className="seer-error">{error}</p>
      ) : hint ? (
        <p className="seer-hint">{hint}</p>
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
          <span>
            Balance{" "}
            {balanceLoading ? (
              <Skeleton className="ml-1 inline-block align-middle" width={60} height={13} />
            ) : (
              <span className="text-ink-2">
                {balance}
                {unit ? ` ${unit}` : ""}
              </span>
            )}
          </span>
        ) : undefined
      }
    >
      {/* Unit and Max sit inside the box, as in every Seer amount field. */}
      <div className="seer-input-group">
        <input
          ref={ref}
          id={id}
          type="number"
          step="any"
          inputMode="decimal"
          disabled={disabled}
          aria-invalid={!!error}
          className={cn("seer-input text-lede", className)}
          {...rest}
        />
        {unit && <span className="seer-input-affix">{unit}</span>}
        {onMax && (
          <button
            type="button"
            onClick={onMax}
            disabled={disabled || balanceLoading}
            className="seer-button seer-button-ghost seer-button-sm text-primary-text"
          >
            Max
          </button>
        )}
      </div>
    </Field>
  );
});

/** Plain text input, the kit's `.seer-input`. */
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} className={cn("seer-input", className)} {...rest} />;
  },
);
