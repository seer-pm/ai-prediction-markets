import {
  AccountLabel,
  Badge,
  Table,
  TableScroller,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@/components/ui";
import { useEnsNames } from "@/hooks/useEnsNames";
import { usePredictionScores } from "@/hooks/usePredictionScores";
import { useProfiles } from "@/hooks/useProfiles";
import type {
  LeaderboardApiRow,
  LeaderboardScope,
  LeaderboardSort,
  LeaderboardSortDir,
} from "@/hooks/useLeaderboard";
import { cn } from "@/utils/cn";
import {
  EM_DASH,
  MINUS,
  formatAmount,
  formatPercent,
  pluralize,
  preciseValue,
} from "@/utils/format";
import type { PredictionScore } from "@/utils/predictionSubmission";
import { memo, useMemo, type ReactNode, type RefObject } from "react";

/**
 * The ranking table itself — no filters, no fetching. Both the full leaderboard tab and the
 * compact per-contest card render this.
 */

/** Signed USD with an explicit glyph: colour is never the only channel (see index.css). */
function SignedAmount({ value }: { value: number }) {
  if (!Number.isFinite(value) || value === 0) return <span className="text-ink-4">{EM_DASH}</span>;
  const sign = value > 0 ? "+" : MINUS;
  return (
    <span className={value > 0 ? "text-long" : "text-short"}>
      {sign}
      {formatAmount(Math.abs(value))}
    </span>
  );
}

function Roi({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-ink-4">{EM_DASH}</span>;
  const percent = value * 100;
  const sign = percent > 0 ? "+" : percent < 0 ? MINUS : "";
  return (
    <span className={percent > 0 ? "text-long" : percent < 0 ? "text-short" : undefined}>
      {sign}
      {formatPercent(Math.abs(percent))}%
    </span>
  );
}

/**
 * The wallet's latest leaderboard submission. "Pending" until one of its markets resolves — the
 * endpoint returns a score, never the predictions, so there is nothing more to show before then.
 */
function SubmissionScore({ value }: { value: PredictionScore | undefined }) {
  if (!value) return <span className="text-ink-4">{EM_DASH}</span>;
  const submitted = new Date(value.submittedAt).toLocaleString();
  if (value.score === null) {
    return (
      <span
        className="text-ink-4"
        title={`Submitted ${submitted} · ${pluralize(value.totalMarkets, "market")} · scored once they resolve`}
      >
        Pending
      </span>
    );
  }
  return (
    <span title={`${value.scoredMarkets} of ${value.totalMarkets} markets resolved · submitted ${submitted}`}>
      {value.score.toFixed(1)}
    </span>
  );
}

interface LeaderboardTableProps {
  rows: LeaderboardApiRow[];
  /** Which submission the Score column reads: the latest anywhere, or the latest in this contest. */
  scope: LeaderboardScope;
  isLoading: boolean;
  /** The column the ranking follows. The `#` column renumbers with it. */
  sortBy: LeaderboardSort;
  sortDir: LeaderboardSortDir;
  onSortChange: (sortBy: LeaderboardSort, sortDir: LeaderboardSortDir) => void;
  /** Addresses belonging to the connected user — their EOA and its trade executor. */
  ownAddresses?: string[];
  /** Row to scroll to after a "Your rank" jump. */
  highlightAddress?: string;
  highlightRef?: RefObject<HTMLTableRowElement | null>;
  /** Rendered in place of the table body when there are no rows. */
  emptyState: ReactNode;
  className?: string;
}

export const LeaderboardTable = memo(function LeaderboardTable({
  rows,
  scope,
  isLoading,
  sortBy,
  sortDir,
  onSortChange,
  ownAddresses = [],
  highlightAddress,
  highlightRef,
  emptyState,
  className,
}: LeaderboardTableProps) {
  // Above the early returns: hooks must run unconditionally. `rows` is empty in both of those
  // cases, so no lookup is issued.
  const addresses = useMemo(() => rows.map((row) => row.address), [rows]);
  const ensNames = useEnsNames(addresses);
  const profiles = useProfiles(addresses);
  const scores = usePredictionScores(addresses, scope);

  if (isLoading) {
    return <TableSkeleton rows={8} columns={6} />;
  }

  if (rows.length === 0) {
    return <>{emptyState}</>;
  }

  const own = new Set(ownAddresses.filter(Boolean).map((address) => address.toLowerCase()));
  const highlight = highlightAddress?.toLowerCase();

  // A fresh column starts on its most interesting end (desc); the active one toggles.
  const sortProps = (column: LeaderboardSort) => ({
    sortDirection: sortBy === column ? sortDir : null,
    onSort: () => onSortChange(column, sortBy === column && sortDir === "desc" ? "asc" : "desc"),
  });

  return (
    <TableScroller className={className}>
      <Table minWidth={760}>
        <Thead>
          <Th pinned className="w-16">
            #
          </Th>
          <Th>Account</Th>
          <Th numeric {...sortProps("pnl")}>
            Profit/Loss
          </Th>
          <Th
            numeric
            // Conditional contests (Round 2 · L2, Originality) trade against a parent outcome
            // token, which has no pool against the collateral. Seer counts only the collateral leg
            // of a swap, so every one of those trades drops out and the whole column — along with
            // the ROI beside it — reads as an em-dash there.
            title="Gross traded notional in USD. Not yet available on the conditional contests (Round 2 · L2, Originality)."
            {...sortProps("volume")}
          >
            Volume
          </Th>
          <Th numeric {...sortProps("roi")}>
            ROI
          </Th>
          <Th
            numeric
            title="Score of the wallet's latest leaderboard submission, 0–100, higher is better: 100 × (1 − average absolute error) against how each predicted market resolved, so 88 means off by 12 points on average. Predictions stay hidden until their markets end."
          >
            Score
          </Th>
        </Thead>
        <Tbody>
          {rows.map((row) => {
            const address = row.address.toLowerCase();
            const isOwn = own.has(address);
            const isHighlighted = !!highlight && address === highlight;
            return (
              <Tr
                key={row.address}
                ref={isHighlighted ? highlightRef : undefined}
                className={cn(isOwn && "bg-primary-bg hover:bg-primary-bg")}
              >
                <Td
                  pinned
                  numeric
                  // The pinned column paints its own background, so it needs the row tint too.
                  className={cn("font-semibold text-ink", isOwn && "!bg-primary-bg")}
                >
                  {row.rank}
                </Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <AccountLabel
                      address={row.address}
                      name={ensNames[address]}
                      profile={profiles[address]}
                    />
                    {isOwn && <Badge tone="neutral">You</Badge>}
                  </span>
                </Td>
                <Td numeric className="font-semibold" title={preciseValue(row.pnl)}>
                  <SignedAmount value={row.pnl} />
                </Td>
                <Td numeric title={preciseValue(row.volume)}>
                  {formatAmount(row.volume)}
                </Td>
                <Td numeric title={preciseValue(row.roi)}>
                  <Roi value={row.roi} />
                </Td>
                <Td numeric>
                  <SubmissionScore value={scores[address]} />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </TableScroller>
  );
});
