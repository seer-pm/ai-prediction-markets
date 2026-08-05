import { Button, Card, ErrorPanel, Skeleton } from "@/components/ui";
import { CheckIcon } from "@/components/ui/icons";
import { DepositInterface } from "@/components/trade/DepositInterface";
import { useCreateTradeExecutor } from "@/hooks/useCreateTradeExecutor";
import { useTradeWalletStatus, type ReadinessStep } from "@/hooks/useTradeWalletStatus";
import { cn } from "@/utils/cn";
import { collateral } from "@/utils/constants";
import { useAppKit } from "@reown/appkit/react";
import { useState } from "react";

const STEPS: Array<{ id: ReadinessStep; title: string; blurb: string }> = [
  {
    id: "connect",
    title: "Connect your wallet",
    blurb: "Optimism is the only network these contests run on.",
  },
  {
    id: "create",
    title: "Create a trade wallet",
    blurb: "A contract you own that batches hundreds of trades into one run.",
  },
  {
    id: "fund",
    title: `Add ${collateral.symbol}`,
    blurb: "Every market settles in it, and it earns Sky savings yield meanwhile.",
  },
];

function Marker({ state, index }: { state: "done" | "current" | "todo"; index: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border text-micro font-bold leading-none",
        state === "done" && "border-long bg-long text-white",
        state === "current" && "border-primary bg-primary text-white",
        state === "todo" && "border-rule-strong bg-surface text-ink-4",
      )}
    >
      {state === "done" ? <CheckIcon width={13} height={13} /> : index + 1}
    </span>
  );
}

/**
 * Three steps stand between a new visitor and their first trade, and until now
 * none of them were named — the trade buttons were simply absent until all
 * three happened to be true. The rail states them, marks where you are, and
 * disappears entirely once you are through.
 */
export function ReadinessRail() {
  const { step, account, tradeExecutor, isConnected, isCheckingExecutor } = useTradeWalletStatus();
  const { open } = useAppKit();
  const createTradeExecutor = useCreateTradeExecutor();
  const [depositOpen, setDepositOpen] = useState(false);

  if (step === "ready") return null;

  const activeIndex = STEPS.findIndex((s) => s.id === step);

  const action = (() => {
    if (step === "connect") {
      return (
        <Button variant="primary" size="sm" onClick={() => open({ view: "Connect" })}>
          Connect wallet
        </Button>
      );
    }
    if (step === "create") {
      if (isCheckingExecutor) return <Skeleton width={140} height={36} className="rounded-md" />;
      return (
        <Button
          variant="primary"
          size="sm"
          loading={createTradeExecutor.isPending}
          onClick={() => account && createTradeExecutor.mutate({ account })}
        >
          Create trade wallet
        </Button>
      );
    }
    return (
      <Button variant="primary" size="sm" onClick={() => setDepositOpen(true)}>
        Add {collateral.symbol}
      </Button>
    );
  })();

  return (
    <>
      <Card flush>
        <ol className="flex flex-col divide-y divide-rule sm:flex-row sm:divide-x sm:divide-y-0">
          {STEPS.map((item, index) => {
            const state = index < activeIndex ? "done" : index === activeIndex ? "current" : "todo";
            return (
              <li
                key={item.id}
                className={cn(
                  "flex min-w-0 flex-1 items-start gap-3 px-6 py-5",
                  state === "todo" && "opacity-55",
                )}
                aria-current={state === "current" ? "step" : undefined}
              >
                <Marker state={state} index={index} />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-body font-semibold",
                      state === "current" ? "text-ink" : "text-ink-2",
                    )}
                  >
                    {item.title}
                  </p>
                  <p className="mt-1 text-body text-ink-3">{item.blurb}</p>
                  {state === "current" && <div className="mt-2.5">{action}</div>}
                </div>
              </li>
            );
          })}
        </ol>

        {createTradeExecutor.isError && (
          <div className="border-t border-rule p-4">
            <ErrorPanel
              title="Could not create the trade wallet"
              error={createTradeExecutor.error}
              onDismiss={createTradeExecutor.reset}
            />
          </div>
        )}
      </Card>

      {isConnected && account && tradeExecutor && (
        <DepositInterface
          open={depositOpen}
          onOpenChange={setDepositOpen}
          account={account}
          tradeExecutor={tradeExecutor}
        />
      )}
    </>
  );
}
