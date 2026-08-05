import { cn } from "@/utils/cn";

interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

/**
 * The single spinner in the app.
 *
 * Drawn as an explicit arc over a faint track rather than the usual
 * `rounded-full border-t-transparent` trick: that relies on `border-t-*`
 * winning over `border-*` in stylesheet order, and when it doesn't you get a
 * complete ring, which spins invisibly. Inherits `currentColor`, so it reads
 * on a blue button and on white alike.
 */
export function Spinner({ size = 16, className, label }: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label={label ?? "Working"}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={cn("shrink-0 animate-spin", className)}
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default Spinner;
