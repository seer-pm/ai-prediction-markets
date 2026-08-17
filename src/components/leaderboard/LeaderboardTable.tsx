import {
  Badge,
  Table,
  TableScroller,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tooltip,
  Tr,
} from "@/components/ui";
import type { LeaderboardApiRow } from "@/hooks/useLeaderboard";
import { cn } from "@/utils/cn";
import { CHAIN_ID } from "@/utils/constants";
import {
  EM_DASH,
  MINUS,
  formatAddress,
  formatAmount,
  formatPercent,
  pluralize,
  preciseValue,
} from "@/utils/format";
import { memo, type ReactNode, type RefObject } from "react";

/**
 * The ranking table itself — no filters, no fetching. Both the full leaderboard tab and the
 * compact per-contest card render this.
 */

const EXPLORER = "https://optimistic.etherscan.io/address";

/** Signed sUSDS with an explicit glyph: colour is never the only channel (see index.css). */
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
  /** Addresses belonging to the connected user — their EOA and its trade executor. */
  ownAddresses?: string[];
  /** Row to scroll to after a "Your rank" jump. */
  highlightAddress?: string;
  highlightRef?: RefObject<HTMLTableRowElement | null>;
  /** Rendered in place of the table body when there are no rows. */
  emptyState: ReactNode;
  /** Per-contest card: fewer skeleton rows. The columns stay the same as the full board. */
  compact?: boolean;
  className?: string;
}

export const LeaderboardTable = memo(function LeaderboardTable({
  rows,
  isLoading,
  ownAddresses = [],
  highlightAddress,
  highlightRef,
  emptyState,
  compact = false,
  className,
}: LeaderboardTableProps) {
  if (isLoading) {
    return <TableSkeleton rows={compact ? 5 : 8} columns={6} />;
  }

  if (rows.length === 0) {
    return <>{emptyState}</>;
  }

  const own = new Set(ownAddresses.filter(Boolean).map((address) => address.toLowerCase()));
  const highlight = highlightAddress?.toLowerCase();

  return (
    <TableScroller className={className}>
      <Table minWidth={720}>
        <Thead>
          <Th pinned className="w-16">
            #
          </Th>
          <Th>Account</Th>
          <Th numeric>Profit/Loss</Th>
          <Th numeric>Volume</Th>
          <Th numeric>ROI</Th>
          <Th numeric>Markets</Th>
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
                    <a
                      href={`${EXPLORER}/${row.address}?chain=${CHAIN_ID}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-data text-ink transition-colors hover:text-primary"
                      title={row.address}
                    >
                      {formatAddress(row.address)}
                    </a>
                    {isOwn && <Badge tone="neutral">You</Badge>}
                    {/* One participant, several wallets — say so rather than silently summing. */}
                    {row.mergedWallets && row.mergedWallets.length > 0 && (
                      <Tooltip
                        content={
                          <span className="block space-y-1">
                            <span className="block">Includes this trader&apos;s other wallets:</span>
                            {row.mergedWallets.map((wallet) => (
                              <span key={wallet} className="block font-mono">
                                {formatAddress(wallet)}
                              </span>
                            ))}
                          </span>
                        }
                      >
                        <span className="cursor-default rounded border border-rule px-1.5 py-0.5 text-micro text-ink-4">
                          +{pluralize(row.mergedWallets.length, "wallet")}
                        </span>
                      </Tooltip>
                    )}
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
                <Td numeric>{row.marketCount}</Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </TableScroller>
  );
});
