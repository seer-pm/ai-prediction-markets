import { Badge, Button, Card } from "@/components/ui";
import {
  useCheckNewTradeExecutorCreated,
  useCheckOldTradeExecutorCreated,
} from "@/hooks/useCheckTradeExecutorCreated";
import { useRedeemableScan } from "@/hooks/useRedeemableScan";
import { useContestTabStore } from "@/stores/contestTabStore";
import { useWalletStore } from "@/stores/walletStore";
import { DEEP_CONTESTS, type Contest } from "@/utils/contests";
import { useMemo } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";

/**
 * Contests whose redeem path works from the deprecated executor.
 *
 * Round 1 signs its batch with the owner wallet directly (`useRedeemToTradeExecutor`), and
 * Originality takes an `isOldWallet` flag that swaps the session key for the owner
 * (`useRedeemOriginality`). The other four submit through a session key that `OldTradeExecutor` —
 * `onlyOwner`, no session-key mechanism — cannot run, and hide their button behind `canTrade`,
 * which is false on the deprecated wallet by construction. A row for one of those would send the
 * reader to a tab with no button, so they are left out entirely.
 */
const DEPRECATED_REDEEMABLE = new Set(["round1", "round2"]);

/** Contests in tab-bar order, skipping any hidden from the bar — those have no panel to open. */
const CONTESTS = DEEP_CONTESTS.filter((contest) => !(contest as Contest).hidden);

interface UnclaimedPayoutsProps {
  /** Bring the markets view forward — a claim opened from the leaderboard has nowhere to land. */
  onOpenMarkets: () => void;
}

/**
 * Settled contests this participant still holds winning positions in.
 *
 * Nothing else in the app knows this. Each contest tab reads only its own balances, and `Tab`
 * mounts a contest only once it has been clicked — so a payout waiting in one of the four archived
 * contests is invisible until you go looking for it. Four of six contests are archived, which makes
 * that the common case rather than an edge case.
 *
 * Silent unless it has something to say: no loading state, no "nothing to claim", nothing at all
 * while the scan is still out. This sits above every page, so a row here has to earn its space —
 * and a board that is usually empty is one people stop reading. The scan behind it waits for the
 * page to go quiet (`usePageIdle`) rather than competing with it.
 *
 * Only rows that lead somewhere are listed. A claim stranded on the deprecated wallet in a contest
 * that cannot redeem from it is not shown, because there is nothing the reader could do about it.
 */
export const UnclaimedPayouts = ({ onOpenMarkets }: UnclaimedPayoutsProps) => {
  const { address: account } = useAccount();
  const { data: newExecutor } = useCheckNewTradeExecutorCreated(account);
  const { data: oldExecutor } = useCheckOldTradeExecutorCreated(account);
  const isUseOldWallet = useWalletStore((s) => s.isUseOldWallet);
  const toggleIsUseOldWallet = useWalletStore((s) => s.toggleIsUseOldWallet);
  const requestTab = useContestTabStore((s) => s.requestTab);

  const scan = useRedeemableScan(account);
  const current = newExecutor?.isCreated ? newExecutor.predictedAddress : undefined;
  const deprecated = oldExecutor?.isCreated ? oldExecutor.predictedAddress : undefined;

  const claims = useMemo(() => {
    const wallets: Array<{ address: Address | undefined; isDeprecated: boolean }> = [
      { address: current, isDeprecated: false },
      { address: deprecated, isDeprecated: true },
    ];
    return wallets.flatMap(({ address, isDeprecated }) => {
      const held = address && scan.data?.wallets[address.toLowerCase()];
      if (!held) return [];
      return CONTESTS.filter(
        (contest) =>
          held[contest.id] && (!isDeprecated || DEPRECATED_REDEEMABLE.has(contest.id)),
      ).map((contest) => ({ contest, isDeprecated }));
    });
  }, [scan.data, current, deprecated]);

  if (claims.length === 0) return null;

  const openClaim = (contestId: string, isDeprecated: boolean) => {
    // The tab reads balances from whichever wallet is selected, so the claim has to be the
    // selected one before the panel mounts or its redeem button will not be there.
    if (isDeprecated !== isUseOldWallet) toggleIsUseOldWallet();
    requestTab(contestId);
    onOpenMarkets();
  };

  return (
    <Card flush>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule px-6 py-3">
        <h2 className="text-body font-semibold text-ink">Unclaimed payouts</h2>
        <p className="text-body text-ink-3">
          Settled contests you still hold winning positions in.
        </p>
      </div>

      <ul className="divide-y divide-rule">
        {claims.map(({ contest, isDeprecated }) => (
          <li
            key={`${contest.id}-${isDeprecated}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3"
          >
            <span className="text-body font-semibold text-ink">{contest.label}</span>
            {isDeprecated && <Badge tone="short">Deprecated wallet</Badge>}
            <Button
              size="sm"
              variant="success"
              className="ml-auto"
              onClick={() => openClaim(contest.id, isDeprecated)}
            >
              {isDeprecated !== isUseOldWallet ? "Switch wallet and open" : "Open"}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
};
