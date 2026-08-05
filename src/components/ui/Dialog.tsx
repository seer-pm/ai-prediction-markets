import * as RadixDialog from "@radix-ui/react-dialog";
import { cn } from "@/utils/cn";
import type { ReactNode } from "react";
import { XIcon } from "./icons";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-4xl",
};

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: Size;
  /**
   * False while a multi-transaction run is in flight. The old hand-rolled
   * modal always closed on Escape and backdrop click, which orphaned a running
   * mutation behind a dismissed UI.
   */
  dismissible?: boolean;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
}: DialogProps) {
  const block = (event: Event) => {
    if (!dismissible) event.preventDefault();
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => (next || dismissible) && onOpenChange(next)}>
      <RadixDialog.Portal>
        {/*
          No backdrop-filter here. Blurring a full-screen overlay forces the
          browser to rasterise everything beneath it — over a long table that
          shows up as a flash every time a dialog opens.
        */}
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <RadixDialog.Content
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-lg bg-surface shadow-pop",
            SIZES[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
            <div className="min-w-0">
              <RadixDialog.Title className="text-title font-bold">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-1 text-body text-ink-3">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            {dismissible && (
              <RadixDialog.Close
                className="-mt-1 -mr-1 cursor-pointer rounded-md p-1.5 text-ink-4 transition-colors hover:bg-sunken hover:text-ink"
                aria-label="Close"
              >
                <XIcon />
              </RadixDialog.Close>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {footer && (
            <div className="flex flex-col-reverse gap-3 border-t border-rule px-6 py-5 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
