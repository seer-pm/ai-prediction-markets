import MarketsPagination from "@/components/MarketsPagination";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorPanel,
  SegmentedControl,
  TableToolbar,
  TextInput,
} from "@/components/ui";
import { SearchIcon } from "@/components/ui/icons";
import {
  fetchLeaderboardRank,
  useLeaderboard,
  type LeaderboardPeriod,
  type LeaderboardScope,
} from "@/hooks/useLeaderboard";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { cn } from "@/utils/cn";
import { DEEP_CONTESTS, getContest } from "@/utils/contests";
import { pluralize } from "@/utils/format";
import { useEffect, useMemo, useRef, useState } from "react";
import { LeaderboardTable } from "./LeaderboardTable";

const PAGE_SIZE = 25;

const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: "1d", label: "1D" },
  { id: "1w", label: "1W" },
  { id: "1m", label: "1M" },
  { id: "all", label: "All" },
];

function scopeLabel(scope: LeaderboardScope): string {
  return scope === "global" ? "All deep markets" : (getContest(scope)?.label ?? scope);
}

function formatUpdatedAt(updatedAt: string | null | undefined): string | null {
  if (!updatedAt) return null;
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() === 0) return null;
  return parsed.toLocaleString();
}

interface LeaderboardPanelProps {
  /** Contest preselected by the "View full leaderboard" link on a contest card. */
  initialScope?: LeaderboardScope;
}

/**
 * Profit & loss ranking across the deep markets.
 *
 * `All deep markets` is Seer's materialized `deepfund` board; each contest chip is computed by
 * our own refresh job. Everything is denominated in sUSDS, like the rest of the app.
 */
export function LeaderboardPanel({ initialScope = "global" }: LeaderboardPanelProps) {
  const { account, tradeExecutor } = useTradeWalletStatus();

  const [scope, setScope] = useState<LeaderboardScope>(initialScope);
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [highlightAddress, setHighlightAddress] = useState<string | undefined>();
  const [rankStatus, setRankStatus] = useState<"idle" | "loading" | "missing" | "error">("idle");
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  const query = useLeaderboard({
    scope,
    period,
    search,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const ownAddresses = useMemo(
    () => [account, tradeExecutor].filter(Boolean) as string[],
    [account, tradeExecutor],
  );

  useEffect(() => {
    if (!highlightAddress) return;
    const frame = requestAnimationFrame(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightAddress, page, query.data?.rows]);

  const resetView = () => {
    setPage(1);
    setHighlightAddress(undefined);
    setRankStatus("idle");
  };

  const jumpToMyRank = async () => {
    if (!account) return;
    setRankStatus("loading");
    try {
      const result = await fetchLeaderboardRank(scope, period, account);
      if (result.rank === null) {
        setRankStatus("missing");
        setHighlightAddress(undefined);
        return;
      }
      setSearch("");
      setSearchInput("");
      setPage(Math.floor((result.rank - 1) / PAGE_SIZE) + 1);
      setHighlightAddress(account.toLowerCase());
      setRankStatus("idle");
    } catch {
      setRankStatus("error");
    }
  };

  const updatedAt = formatUpdatedAt(query.data?.updatedAt);

  if (query.error) {
    return <ErrorPanel title="The leaderboard could not be loaded" error={query.error} />;
  }

  return (
    <Card flush>
      <CardHeader
        eyebrow="Leaderboard"
        title={scopeLabel(scope)}
        description={
          scope === "global"
            ? "Every wallet ranked by realised and marked-to-market profit across all deep markets, in sUSDS."
            : "Wallets ranked by profit in this contest and its child markets, in sUSDS."
        }
        actions={
          <SegmentedControl
            size="sm"
            segments={PERIODS.map(({ id, label }) => ({ id, label }))}
            value={period}
            onChange={(id) => {
              setPeriod(id as LeaderboardPeriod);
              resetView();
            }}
          />
        }
      />

      <TableToolbar>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label font-semibold tracking-wider text-ink-4 uppercase">
            Market
          </span>
          {[{ id: "global", label: "All" }, ...DEEP_CONTESTS].map((option) => {
            const active = scope === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setScope(option.id);
                  resetView();
                }}
                className={cn(
                  "cursor-pointer rounded-md border px-2.5 py-1 text-body font-medium transition-colors",
                  active
                    ? "border-primary-rule bg-primary-bg text-primary"
                    : "border-rule text-ink-3 hover:text-ink",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {account && (
            <Button
              size="sm"
              variant="secondary"
              loading={rankStatus === "loading"}
              onClick={() => void jumpToMyRank()}
            >
              Your rank
            </Button>
          )}
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
              resetView();
            }}
          >
            <TextInput
              type="search"
              className="w-full py-1.5 sm:w-56"
              placeholder="Search by address"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <Button size="sm" type="submit" variant="secondary" iconLeft={<SearchIcon />}>
              Search
            </Button>
            {search && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setSearchInput("");
                  resetView();
                }}
              >
                Clear
              </Button>
            )}
          </form>
        </div>
      </TableToolbar>

      {rankStatus === "missing" && (
        <p className="border-b border-rule px-6 py-3 text-body text-ink-3">
          Your wallet has no ranked position here yet.
        </p>
      )}
      {rankStatus === "error" && (
        <p className="border-b border-rule px-6 py-3 text-body text-short">
          Your rank could not be looked up. Try again.
        </p>
      )}

      <LeaderboardTable
        rows={query.data?.rows ?? []}
        isLoading={query.isLoading}
        ownAddresses={ownAddresses}
        highlightAddress={highlightAddress}
        highlightRef={highlightRef}
        emptyState={
          <EmptyState
            title={search ? "No wallet matches that address" : "No ranked wallets yet"}
            description={
              search
                ? "Clear the search to see the full ranking."
                : "Rankings appear once the refresh job has scored this market's traders."
            }
          />
        }
      />

      <div className="flex flex-col gap-3 border-t border-rule px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-ink-3">
          {pluralize(total, "wallet")}
          {updatedAt && <> · updated {updatedAt}</>}
        </p>
        {pageCount > 1 && (
          <MarketsPagination
            page={page}
            pageCount={pageCount}
            handlePageClick={({ selected }) => {
              setPage(selected + 1);
              setHighlightAddress(undefined);
            }}
          />
        )}
      </div>
    </Card>
  );
}
