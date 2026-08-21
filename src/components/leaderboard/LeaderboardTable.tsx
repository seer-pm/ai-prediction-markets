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
import { useProfiles } from "@/hooks/useProfiles";
import type {
  LeaderboardApiRow,
  LeaderboardSort,
  LeaderboardSortDir,
} from "@/hooks/useLeaderboard";
import { cn } from "@/utils/cn";
import { EM_DASH, MINUS, formatAmount, formatPercent, preciseValue } from "@/utils/format";
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

interface LeaderboardTableProps {
  rows: LeaderboardApiRow[];
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

  if (isLoading) {
    return <TableSkeleton rows={8} columns={5} />;
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
      <Table minWidth={680}>
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
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </TableScroller>
  );
});
