import * as RadixDialog from "@radix-ui/react-dialog";
import { cn } from "@/utils/cn";
import type { ReactNode } from "react";

type Size = "sm" | "md";

/** The kit's two dialog widths: 480px, and 640px for the wide one. */
const SIZES: Record<Size, string> = {
  sm: "w-[min(480px,calc(100vw-32px))]",
  md: "w-[min(640px,calc(100vw-32px))]",
};

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: Size;
  /**
   * False while a multi-transaction run is in flight: Escape, the backdrop and the close button
   * stop dismissing it, so a running mutation never ends up behind a closed UI.
   */
  dismissible?: boolean;
}

/**
 * The kit's dialog (header, title, description, body and footer from components.css) on Radix
 * rather than the kit's native `<dialog>`. A modal `<dialog>` sits in the top layer and makes the
 * rest of the page inert, and this app's run toasts and its tooltips render in `<body>`: they
 * would land beneath the backdrop and stop responding during exactly the runs that start here.
 * The box mirrors `.seer-dialog`: hairline surface, 10px radius, a bottom sheet on a phone.
 */
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
        <RadixDialog.Overlay className="fixed inset-0 z-50 animate-backdrop-in bg-seer-ink/56" />
        <RadixDialog.Content
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-lg border border-rule bg-surface text-ink shadow-pop animate-dialog-in",
            "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-h-[calc(100dvh-24px)] max-sm:translate-x-0 max-sm:translate-y-0",
            "max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:animate-sheet-in",
            SIZES[size],
          )}
        >
          <div className="seer-dialog-panel min-h-0 flex-1">
            <div className="seer-dialog-header">
              <div className="seer-dialog-heading">
                <RadixDialog.Title className="seer-dialog-title">{title}</RadixDialog.Title>
                {description && (
                  <RadixDialog.Description className="seer-dialog-description">
                    {description}
                  </RadixDialog.Description>
                )}
              </div>
              {dismissible && (
                <RadixDialog.Close
                  className="seer-button seer-button-ghost seer-button-icon seer-button-sm"
                  aria-label="Close"
                >
                  <span className="seer-icon seer-icon-close" aria-hidden="true" />
                </RadixDialog.Close>
              )}
            </div>

            {/*
              A body that renders nothing would otherwise leave an empty padded
              band. Callers pass a falsy child when they have nothing to say, and
              the kit then drops the footer's rule as well.
            */}
            {children && <div className="seer-dialog-body min-h-0 flex-1">{children}</div>}

            {footer && <div className="seer-dialog-footer">{footer}</div>}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
