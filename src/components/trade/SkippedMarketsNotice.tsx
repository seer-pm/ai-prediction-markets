import { Panel } from "@/components/ui";

/**
 * Shown after a run that went through but left markets out, so nothing is dropped without a word.
 *
 * Two causes, kept apart because they mean different things: a market whose quote failed every
 * attempt was never in the run at all, while a pruned call was in it but would have reverted on
 * chain and was taken out of its batch.
 */
export function SkippedMarketsNotice({
  markets,
  prunedCalls = 0,
  retry,
}: {
  /** Proposal titles whose quotes failed every attempt. */
  markets: string[];
  prunedCalls?: number;
  /** What running again does, in the dialog's own words. */
  retry: string;
}) {
  if (!markets.length && !prunedCalls) return null;

  const title = markets.length
    ? `${markets.length} market${markets.length === 1 ? " was" : "s were"} not traded`
    : `${prunedCalls} call${prunedCalls === 1 ? " was" : "s were"} left out`;

  return (
    <Panel tone="info" title={title}>
      {markets.length > 0 && (
        <>
          <p>
            Their prices could not be fetched, even after retrying. That is usually the network, not
            the pools.
          </p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5">
            {markets.map((market) => (
              <li key={market}>{market}</li>
            ))}
          </ul>
        </>
      )}
      {prunedCalls > 0 && (
        <p className={markets.length ? "mt-1.5" : undefined}>
          {prunedCalls} call{prunedCalls === 1 ? "" : "s"} would have failed on chain and{" "}
          {prunedCalls === 1 ? "was" : "were"} taken out of the batch.
        </p>
      )}
      <p className="mt-1.5">{retry}</p>
    </Panel>
  );
}
