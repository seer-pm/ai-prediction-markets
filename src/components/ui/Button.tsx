import { cn } from "@/utils/cn";
import React, { forwardRef } from "react";
import { Tooltip } from "./Tooltip";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
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

/**
 * The kit's buttons (`.seer-button`, components.css). `secondary` is the bordered alternative,
 * the kit's outline; danger and success are this app's, built on the status colours.
 */
const VARIANTS: Record<Variant, string> = {
  primary: "seer-button-primary",
  secondary: "seer-button-outline",
  ghost: "seer-button-ghost",
  danger:
    "seer-button-outline text-short shadow-[inset_0_0_0_1px_var(--color-short-rule)] hover:bg-short-bg hover:text-short hover:shadow-[inset_0_0_0_1px_var(--color-short)]",
  success: "bg-long text-paper hover:bg-long-hover",
};

/** 32, 40 and 48px, the kit's three heights. */
const SIZES: Record<Size, string> = {
  sm: "seer-button-sm",
  md: "",
  lg: "seer-button-lg",
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
        "seer-button",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "seer-button-block",
        // A running action keeps full strength: the kit's spinner says it is working, and a
        // dimmed button would read as one that cannot be used.
        "aria-busy:cursor-progress aria-busy:opacity-100",
        className,
      )}
      {...rest}
    >
      {/* With aria-busy the kit draws the spinner in front of the label. */}
      {!loading && iconLeft}
      {children}
      {iconRight}
    </button>
  );

  if (inert && disabledReason) {
    return <Tooltip content={disabledReason}>{button}</Tooltip>;
  }

  return button;
});
