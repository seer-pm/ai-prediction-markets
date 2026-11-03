import { Button, Card, EmptyState, ErrorPanel, Panel } from "@/components/ui";
import { useMarketsData } from "@/hooks/useMarketsData";
import { useOriginalityMarketsData } from "@/hooks/useOriginalityMarketsData";
import { useRecoverPositions } from "@/hooks/useRecoverPositions";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { RecoveryStep, STEP_LABELS } from "@/lib/recovery/strandedPositions";
import {
  ORIGINALITY_ROUND_2,
  ORIGINALITY_ROUND_3,
  ORIGINALITY_ROUND_3_INCORRECT,
} from "@/utils/originalityRounds";
import { useMemo } from "react";
import { Address } from "viem";

const STEPS: Exclude<RecoveryStep, "done">[] = ["unwrap", "approve", "rewrap", "revoke"];

/**
 * For people who used the "Withdraw tokens" button this app had until 2026-11-03. It moved a
 * contest's outcome tokens out of the trade wallet into the owner's own, where Sell all and Redeem
 * cannot reach them. This page moves them back in a handful of transactions — see
 * `@/lib/recovery/strandedPositions` for how.
 *
 * Reached only by its link (`RECOVER_POSITIONS_PATH`); nothing in the app points here.
 */
export function RecoverPositions({ onOpenMarkets }: { onOpenMarkets: () => void }) {
  const { account, tradeExecutor, isCreated } = useTradeWalletStatus();

  // Every contest that had the button: the AI markets and each originality round.
  const { data: aiMarkets } = useMarketsData();
  const { data: round2 } = useOriginalityMarketsData(ORIGINALITY_ROUND_2);
  const { data: round3 } = useOriginalityMarketsData(ORIGINALITY_ROUND_3);
  const { data: round3Incorrect } = useOriginalityMarketsData(ORIGINALITY_ROUND_3_INCORRECT);
  const isLoadingMarkets = !aiMarkets || !round2 || !round3 || !round3Incorrect;
  const tokens = useMemo<Address[]>(
    () =>
      isLoadingMarkets
        ? []
        : [
            ...(aiMarkets.wrappedTokens ?? []),
            ...[round2, round3, round3Incorrect].flatMap((round) =>
              (round.markets ?? []).flatMap((market) => market.wrappedTokens),
            ),
          ],
    [isLoadingMarkets, aiMarkets, round2, round3, round3Incorrect],
  );

  const { scan, run, progress, resetProgress } = useRecoverPositions(
    account,
    isCreated ? tradeExecutor : undefined,
    tokens,
  );

  const intro = (
    <Panel title="Move positions back to your trade wallet">
      <p>
        Until 3 November, a <strong>Withdraw tokens</strong> button moved your outcome tokens from
        your trade wallet to your own wallet. They are safe there, but the app cannot see them, so{" "}
        <strong>Sell all</strong> and <strong>Redeem</strong> cannot use them.
      </p>
    </Panel>
  );

  const body = (() => {
    if (!account) {
      return <EmptyState title="Connect your wallet" description="Connect the wallet that holds the positions." />;
    }
    if (!isCreated || !tradeExecutor) {
      return (
        <EmptyState
          title="No trade wallet"
          description="This wallet has no trade wallet, so there is nowhere to move positions back to."
        />
      );
    }
    if (isLoadingMarkets || scan.isLoading) {
      return (
        <Panel tone="working" title="Checking your wallet">
          Looking for outcome tokens from every contest. This can take a few seconds.
        </Panel>
      );
    }
    if (scan.error) {
      return (
        <ErrorPanel
          title="Could not read your wallet"
          error={scan.error}
          onDismiss={() => scan.refetch()}
        />
      );
    }
    const data = scan.data;
    if (!data) return null;

    const held = data.positions.length;
    const finished = data.step === "done";

    if (finished && !run.isSuccess) {
      return (
        <EmptyState
          title="Nothing to move back"
          description="Your wallet holds no outcome tokens from these contests outside your trade wallet."
          actions={<Button onClick={onOpenMarkets}>Go to the markets</Button>}
        />
      );
    }
    if (finished && run.isSuccess) {
      return (
        <Panel tone="success" title="Your positions are back in your trade wallet">
          <p>Open the contest and use Sell all positions, or Redeem once it has settled.</p>
          <div className="mt-3">
            <Button variant="primary" size="sm" onClick={onOpenMarkets}>
              Go to the markets
            </Button>
          </div>
        </Panel>
      );
    }

    const current = run.isPending ? progress?.step : data.step;
    const currentIndex = current && current !== "done" ? STEPS.indexOf(current) : -1;

    return (
      <div className="space-y-4">
        {held > 0 && (
          <p className="text-body text-ink-2">
            Found <strong>{held}</strong> position{held === 1 ? "" : "s"} in your own wallet.
          </p>
        )}

        <ol className="space-y-2">
          {STEPS.map((step, i) => {
            const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
            return (
              <li key={step} className="flex items-baseline gap-3 text-body">
                <span
                  className={
                    state === "done"
                      ? "text-long"
                      : state === "current"
                        ? "font-semibold text-primary"
                        : "text-ink-3"
                  }
                >
                  {i + 1}. {STEP_LABELS[step]}
                  {state === "current" && run.isPending && progress?.count
                    ? ` (${progress.count} position${progress.count === 1 ? "" : "s"})`
                    : ""}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="text-data text-ink-3">
          Each step is one transaction you confirm in your wallet; a large wallet may need two for
          steps 1 and 3. Step 2 lets your trade wallet take these positions from your wallet, and
          step 4 takes that permission back. If anything stops, come back to this page — it picks
          up where it left off.
        </p>

        {data.unrecoverable.length > 0 && (
          <Panel tone="error" title={`${data.unrecoverable.length} token(s) can't be moved here`}>
            They don't match the contest markets this page knows how to rebuild. They are still in
            your wallet; contact us and we'll help with these.
          </Panel>
        )}

        {run.isError && (
          <ErrorPanel
            title="The recovery stopped"
            error={run.error}
            onDismiss={() => {
              run.reset();
              resetProgress();
            }}
          />
        )}

        <Button
          variant="primary"
          loading={run.isPending}
          disabled={run.isPending}
          onClick={() => {
            resetProgress();
            run.mutate();
          }}
        >
          {currentIndex > 0 ? "Continue" : "Move positions back"}
        </Button>
      </div>
    );
  })();

  return (
    <div className="space-y-6">
      {intro}
      <Card className="!px-6 !py-5">{body}</Card>
    </div>
  );
}
