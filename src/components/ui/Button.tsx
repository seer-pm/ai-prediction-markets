import { cn } from "@/utils/cn";
import React, { forwardRef } from "react";
import { Spinner } from "./Spinner";
import { Tooltip } from "./Tooltip";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /**
   * Why the button can't be used right now. Shown on hover and focus and read
   * by screen readers, and the button stays focusable so the reason is
   * actually reachable. Previously six ORed conditions disabled the execute
   * button and surfaced none of them.
   */
  disabledReason?: string;
  fullWidth?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-white border border-primary shadow-raised hover:bg-primary-hover hover:border-primary-hover",
  secondary:
    "bg-surface text-ink border border-rule-strong shadow-raised hover:bg-sunken hover:border-ink-4",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-sunken hover:text-ink",
  danger: "bg-surface text-short border border-short-rule shadow-raised hover:bg-short-bg",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 gap-1.5 px-3 text-data",
  md: "h-10 gap-2 px-5 text-body",
  lg: "h-12 gap-2 px-6 text-lede",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    disabled = false,
    disabledReason,
    fullWidth = false,
    iconLeft,
    iconRight,
    className,
    children,
    onClick,
    type = "button",
    ...rest
  },
  ref,
) {
  const inert = disabled || loading;
  // With a reason to show, stay focusable and block the action instead of
  // going `disabled`, which would make the explanation unreachable.
  const softDisabled = inert && !!disabledReason && !loading;

  const button = (
    <button
      ref={ref}
      type={type}
      disabled={inert && !softDisabled}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (inert) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      }}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors",
        "disabled:shadow-none aria-disabled:shadow-none",
        "disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 14 : 16} /> : iconLeft}
      {children}
      {iconRight}
    </button>
  );

  if (inert && disabledReason) {
    return <Tooltip content={disabledReason}>{button}</Tooltip>;
  }

  return button;
});
