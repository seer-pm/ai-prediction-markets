import {
  Card,
  CardHeader,
  DeltaCell,
  OutcomeBar,
  Skeleton,
  Table,
  TableScroller,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Thr,
  Tooltip,
  Tr,
} from "@/components/ui";
import { ChevronDownIcon, HelpIcon } from "@/components/ui/icons";
import { ExportWeightsButton } from "@/components/contest/ExportWeightsButton";
import { OriginalityTableData } from "@/types";
import { cn } from "@/utils/cn";
import { DECIMALS } from "@/utils/constants";
import { useTableSort, type SortDir } from "@/hooks/useTableSort";
import {
  compareNullsLast,
  formatShare,
  formatSignedWeight,
  formatTokenAmount,
  formatWeight,
  magnitude,
  preciseValue,
} from "@/utils/format";
import { MAX_PINS, pinCount, pinSlot, type Pins } from "@/utils/pins";
import React, { useMemo, useState, type ReactNode } from "react";

// Written in the table's own column names, so the equation points at what is on screen.
const DIFFERENCE_HELP = {
  UP: "= Predicted − Market UP",
  DOWN: "= 1 − Predicted − Market DOWN",
} as const;

type SortColumn = "repo" | "upPrice" | "upDifference" | "downPrice" | "downDifference";

/** Rows a phone lists before "Show all". */
const PHONE_ROWS = 10;

/** Bars share one width down the column, so they compare. */
const BAR_TRACK = 120;

/**
 * A Difference header with a "?" that says what it is measured against. The table has no Fair
 * column — UP's fair price is the Predicted column and DOWN's is 1 − it — so this is where the
 * target is spelled out.
 *
 * It draws its own sort control rather than going through `Th`'s, which would wrap the "?" button
 * in the sort button — a button inside a button. The `Th` around it still carries `aria-sort`.
 */
const DifferenceHeader = ({
  side,
  sortDirection,
  onSort,
}: {
  side: "UP" | "DOWN";
  sortDirection: SortDir | null;
  onSort: () => void;
}) => (
  <span className="inline-flex items-center gap-1">
    <button
      type="button"
      onClick={onSort}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 uppercase transition-colors hover:text-ink",
        sortDirection && "text-ink",
      )}
    >
      Difference
      <ChevronDownIcon
        width={12}
        height={12}
        strokeWidth={2.5}
        className={cn(
          "shrink-0 transition-transform",
          sortDirection === "asc" && "rotate-180",
          !sortDirection && "opacity-30",
        )}
      />
    </button>
    <Tooltip content={<span>{DIFFERENCE_HELP[side]}</span>}>
      <button
        type="button"
        aria-label={`How the ${side} difference is calculated`}
        className="cursor-help text-ink-4 transition-colors hover:text-ink"
      >
        <HelpIcon />
      </button>
    </Tooltip>
  </span>
);

/** A side's group heading: its swatch, so the bar's colours have a key, and its meaning in words. */
const SideHeading = ({ slot, children }: { slot: 1 | 2; children: ReactNode }) => (
  <span className="inline-flex items-center gap-2 text-ink">
    <span
      aria-hidden
      className={cn("h-2 w-3 rounded-full", slot === 1 ? "bg-seer-series-1" : "bg-seer-series-2")}
    />
    {children}
  </span>
);

/**
 * Follow a repository's line on the chart. The swatch shows the colour it takes there; a hairline
 * ring means it is drawn as context. Four at once, the number of series colours the kit validates.
 */
const FollowToggle = ({
  repo,
  pins,
  onToggle,
}: {
  repo: string;
  pins: Pins;
  onToggle: (repo: string) => void;
}) => {
  const slot = pinSlot(pins, repo);
  const blocked = slot === null && pinCount(pins) >= MAX_PINS;
  return (
    <button
      type="button"
      aria-pressed={slot !== null}
      aria-disabled={blocked || undefined}
      aria-label={`Follow ${repo} on the chart`}
      title={
        blocked
          ? `Follow up to ${MAX_PINS} at once`
          : slot !== null
            ? "Following on the chart"
            : "Follow on the chart"
      }
      onClick={() => !blocked && onToggle(repo)}
      className={cn(
        "seer-button seer-button-ghost seer-button-icon seer-button-sm -my-1 -ml-2 shrink-0",
        blocked && "cursor-not-allowed opacity-40",
      )}
    >
      <span
        aria-hidden
        className={cn("size-3 rounded-full", slot === null && "border border-rule-strong")}
        style={slot !== null ? { background: `var(--seer-series-${slot + 1})` } : undefined}
      />
    </button>
  );
};

interface MarketTableProps {
  markets: OriginalityTableData[];
  isLoading: boolean;
  isLoadingBalances: boolean;
  emptyState?: ReactNode;
  onExport?: () => void;
  exportDisabled?: boolean;
  /** The repositories followed on the chart, shared with it. */
  pins?: Pins;
  onTogglePin?: (repo: string) => void;
}

/**
 * The field: every repository ranked by the market's estimate of its original work, with the two
 * sides of its pair as one bar and the reader's prediction marked on it. The trader's columns
 * (differences and balances) follow, so the asker's reading comes first along the row.
 */
const OriginalityMarketTableInner: React.FC<MarketTableProps> = ({
  markets,
  isLoading,
  isLoadingBalances,
  emptyState,
  onExport,
  exportDisabled,
  pins,
  onTogglePin,
}) => {
  const visibleRows = useMemo(
    () => markets.filter((market) => market.repo !== "Invalid result"),
    [markets],
  );

  // The ranking is the reading, so the field opens on it.
  const { sort, sortProps } = useTableSort<SortColumn>(["repo"], { column: "upPrice", dir: "desc" });
  const ariaSort = (column: SortColumn) =>
    sort?.column === column ? (sort.dir === "asc" ? "ascending" : "descending") : "none";

  const sortedRows = useMemo(() => {
    if (!sort) return visibleRows;
    const { column, dir } = sort;
    return [...visibleRows].sort((a, b) => {
      if (column === "repo") return (dir === "asc" ? 1 : -1) * a.repo.localeCompare(b.repo);
      // Differences sort by size: the largest disagreements lead whichever way they run.
      const order =
        column === "upPrice" || column === "downPrice"
          ? compareNullsLast(a[column], b[column], dir)
          : compareNullsLast(magnitude(a[column]), magnitude(b[column]), dir);
      return order || a.repo.localeCompare(b.repo);
    });
  }, [visibleRows, sort]);

  // A phone shows the leaders and lets the reader ask for the rest, rather than nesting a scroll
  // box inside the page that traps the thumb and hides how long the list is.
  const [showAll, setShowAll] = useState(false);
  const phoneRows = showAll ? sortedRows : sortedRows.slice(0, PHONE_ROWS);

  const follow = (repo: string) =>
    pins && onTogglePin ? <FollowToggle repo={repo} pins={pins} onToggle={onTogglePin} /> : null;

  const balance = (value: bigint | undefined) =>
    isLoadingBalances ? (
      <Skeleton className="ml-auto" width={44} height={9} />
    ) : (
      formatTokenAmount(typeof value === "bigint" ? value : undefined, DECIMALS)
    );

  return (
    <Card flush>
      <CardHeader
        title="Original work per repository"
        description="Ranked by the market's estimate. Each bar splits a repository into its original work (UP) and the share its dependencies carry (DOWN); a tick marks your prediction."
        actions={onExport && <ExportWeightsButton onClick={onExport} disabled={exportDisabled} />}
      />

      {isLoading ? (
        <TableSkeleton columns={7} />
      ) : visibleRows.length === 0 ? (
        emptyState
      ) : (
        <>
          {/* A phone reads the field as a list: name, bar, then where your prediction differs. */}
          <ol aria-label="Repositories" className="divide-y divide-rule sm:hidden">
            {phoneRows.map((market) => (
              <li key={market.marketId} className="flex items-start gap-1 px-4 py-3">
                <span className="pt-1 pl-2">{follow(market.repo)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold text-ink" title={market.repo}>
                    {market.repo}
                  </p>
                  <OutcomeBar
                    className="mt-2"
                    first={market.upPrice}
                    second={market.downPrice}
                    marker={market.predictedOriginality}
                    format={formatShare}
                    track={150}
                  />
                  {market.predictedOriginality !== null && (
                    <p className="mt-1.5 text-micro text-ink-3">
                      Predicted {formatWeight(market.predictedOriginality)}
                      {market.upDifference !== null && (
                        <> · UP difference {formatSignedWeight(market.upDifference)}</>
                      )}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {sortedRows.length > PHONE_ROWS && (
            <div className="border-t border-rule p-4 sm:hidden">
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="seer-button seer-button-outline seer-button-block"
              >
                {showAll ? `Show the top ${PHONE_ROWS}` : `Show all ${sortedRows.length} repositories`}
              </button>
            </div>
          )}

          <TableScroller className="max-sm:hidden">
            <Table minWidth={900}>
              <Thead multiRow>
                <Thr>
                  <Th pinned rowSpan={2} className="align-bottom" {...sortProps("repo")}>
                    Repository
                  </Th>
                  <Th rowSpan={2} className="align-bottom" {...sortProps("upPrice")}>
                    Market · UP / DOWN
                  </Th>
                  <Th numeric rowSpan={2} className="align-bottom">
                    Predicted
                  </Th>
                  <Th colSpan={2} className="border-l border-rule text-center">
                    <SideHeading slot={1}>Original work · UP</SideHeading>
                  </Th>
                  <Th colSpan={2} className="border-l border-rule text-center">
                    <SideHeading slot={2}>Dependencies · DOWN</SideHeading>
                  </Th>
                </Thr>
                <Thr>
                  <Th numeric className="border-l border-rule" aria-sort={ariaSort("upDifference")}>
                    <DifferenceHeader side="UP" {...sortProps("upDifference")} />
                  </Th>
                  <Th numeric>Balance</Th>
                  <Th numeric className="border-l border-rule" aria-sort={ariaSort("downDifference")}>
                    <DifferenceHeader side="DOWN" {...sortProps("downDifference")} />
                  </Th>
                  <Th numeric>Balance</Th>
                </Thr>
              </Thead>
              <Tbody>
                {sortedRows.map((market) => (
                  <Tr key={market.marketId}>
                    <Td pinned>
                      <span className="flex items-center gap-1">
                        {follow(market.repo)}
                        <span className="block max-w-[15rem] truncate" title={market.repo}>
                          {market.repo}
                        </span>
                      </span>
                    </Td>
                    <Td
                      title={`UP ${preciseValue(market.upPrice)} · DOWN ${preciseValue(market.downPrice)}`}
                    >
                      <OutcomeBar
                        first={market.upPrice}
                        second={market.downPrice}
                        marker={market.predictedOriginality}
                        format={formatShare}
                        track={BAR_TRACK}
                      />
                    </Td>
                    <Td numeric className="text-ink" title={preciseValue(market.predictedOriginality)}>
                      {formatWeight(market.predictedOriginality)}
                    </Td>

                    <Td className="border-l border-rule text-right">
                      <DeltaCell
                        value={market.upDifference}
                        bar={false}
                        format={formatSignedWeight}
                        title={preciseValue(market.upDifference)}
                      />
                    </Td>
                    <Td numeric>{balance(market.upBalance)}</Td>

                    <Td className="border-l border-rule text-right">
                      <DeltaCell
                        value={market.downDifference}
                        bar={false}
                        format={formatSignedWeight}
                        title={preciseValue(market.downDifference)}
                      />
                    </Td>
                    <Td numeric>{balance(market.downBalance)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableScroller>
          <p className="border-t border-rule px-6 py-3 text-micro text-ink-3 max-sm:hidden">
            {sortedRows.length} repositories, ranked by the market's estimate.
          </p>
        </>
      )}
    </Card>
  );
};

export const OriginalityMarketTable = React.memo(OriginalityMarketTableInner);
