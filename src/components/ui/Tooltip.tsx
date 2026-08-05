import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RadixTooltip.Provider delayDuration={200} skipDelayDuration={300}>
    {children}
  </RadixTooltip.Provider>
);

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Render the trigger's own element rather than wrapping it in a span. */
  asChild?: boolean;
}

export function Tooltip({ content, children, side = "top", asChild = true }: TooltipProps) {
  if (!content) return <>{children}</>;

  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild={asChild}>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-[20rem] rounded-md bg-ink px-3 py-2 text-data text-white shadow-pop"
        >
          {content}
          <RadixTooltip.Arrow className="fill-ink" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
