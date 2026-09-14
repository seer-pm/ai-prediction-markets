import { cn } from "@/utils/cn";
import type { ButtonHTMLAttributes } from "react";

interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type" | "role"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** An on/off toggle. A `role="switch"` button, so a `<label htmlFor>` pointing at it toggles it. */
export function Switch({ checked, onCheckedChange, disabled, className, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-rule disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "bg-primary" : "bg-rule-strong",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-4 rounded-full bg-surface shadow-raised transition-transform",
          checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
