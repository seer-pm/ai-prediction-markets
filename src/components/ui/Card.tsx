import { cn } from "@/utils/cn";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Removes the body padding — use when the card holds a full-bleed table. */
  flush?: boolean;
}

/** A white surface lifted off the grey page — depth carries the hierarchy. */
export function Card({ children, className, flush = false }: CardProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-rule bg-surface",
        !flush && "p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  /** The heading level. A page whose card is its main heading (the leaderboard) passes `h1`. */
  as?: "h1" | "h2";
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, as: Heading = "h2", description, actions, className }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-rule px-6 py-5 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {/* A step under a page heading on a phone, where the page heading is 32px. */}
        <Heading className="text-xl font-bold sm:text-title">{title}</Heading>
        {description && <p className="mt-1 text-body text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("p-6", className)}>{children}</div>;
}
