import * as Popover from "@radix-ui/react-popover";
import { Avatar, Badge, Button, Skeleton } from "@/components/ui";
import { ChevronDownIcon, ExternalIcon } from "@/components/ui/icons";
import { useCheckOldTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { useProfiles } from "@/hooks/useProfiles";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { useWalletStore } from "@/stores/walletStore";
import { collateral } from "@/utils/constants";
import { formatAddress, formatTokenAmount } from "@/utils/format";
import { useMemo, useState } from "react";
import { useDisconnect } from "wagmi";
import { DepositInterface } from "./DepositInterface";
import { WithdrawInterface } from "./WithdrawInterface";

/**
 * The trade wallet lives in the header once it exists, so its balance is
 * always on screen while you read a table. It used to be a full-width dark
 * card pushing the actual content down the page.
 */
export function TradeWalletMenu() {
  const { account, chain, tradeExecutor, isCreated, balance, isBalanceLoading, isUseOldWallet } =
    useTradeWalletStatus();
  const toggleIsUseOldWallet = useWalletStore((s) => s.toggleIsUseOldWallet);
  // Only surfaced to accounts that actually deployed one — there is nothing to
  // switch to otherwise, and naming it just raises a question new users can do
  // nothing with.
  const { data: oldExecutor } = useCheckOldTradeExecutorCreated(account);
  const hasDeprecatedWallet = !!oldExecutor?.isCreated;
  const { disconnect } = useDisconnect();

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  // Above the early return, like every other hook here. An undefined account looks up nothing.
  const profiles = useProfiles(useMemo(() => (account ? [account] : []), [account]));
  const profile = account ? profiles[account.toLowerCase()] : undefined;

  if (!account) return null;

  const explorer = chain?.blockExplorers?.default?.url;

  return (
    <>
      <Popover.Root>
        <Popover.Trigger className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-rule-strong bg-surface pr-2.5 pl-2 text-body shadow-raised transition-colors hover:border-ink-4">
          <Avatar address={account} src={profile?.avatarUrl} size={22} />
          {isCreated ? (
            isBalanceLoading ? (
              <Skeleton width={64} height={14} />
            ) : (
              <span className="font-mono font-semibold text-ink">
                {formatTokenAmount(balance, collateral.decimals)}
                <span className="ml-1 text-ink-3">{collateral.symbol}</span>
              </span>
            )
          ) : (
            <span className="text-ink-2">{formatAddress(account)}</span>
          )}
          <ChevronDownIcon className="text-ink-4" />
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={6}
            collisionPadding={12}
            className="z-50 w-80 overflow-hidden rounded-lg bg-surface shadow-pop"
          >
            <div className="border-b border-rule px-4 py-3">
              <p className="text-label font-semibold tracking-wider text-ink-3 uppercase">
                Connected account
              </p>
              <div className="mt-2 flex items-center gap-2.5">
                <Avatar address={account} src={profile?.avatarUrl} size={32} />
                <div className="min-w-0">
                  {profile?.displayName && (
                    <p className="truncate text-body font-semibold text-ink">
                      {profile.displayName}
                    </p>
                  )}
                  <p className="font-mono text-body text-ink-3">{formatAddress(account, 10, 8)}</p>
                </div>
              </div>
            </div>

            {isCreated && tradeExecutor && (
              <div className="border-b border-rule px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-label font-semibold tracking-wider text-ink-3 uppercase">
                    Trade wallet
                  </p>
                  {isUseOldWallet && <Badge tone="short">Deprecated</Badge>}
                </div>

                <a
                  href={explorer ? `${explorer}/address/${tradeExecutor}` : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-body text-primary transition-colors hover:text-primary-hover"
                >
                  {formatAddress(tradeExecutor, 10, 8)}
                  <ExternalIcon width={12} height={12} />
                </a>

                <div className="mt-3 flex items-baseline justify-between">
                  <a
                    href="https://app.sky.money/?network=OP&widget=savings&flow=supply&source_token=USDC"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-body text-ink-3 underline underline-offset-2 hover:text-ink"
                  >
                    {collateral.symbol} balance
                  </a>
                  {isBalanceLoading ? (
                    <Skeleton width={80} height={16} />
                  ) : (
                    <span className="font-mono text-lede font-bold text-ink">
                      {formatTokenAmount(balance, collateral.decimals)}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  {!isUseOldWallet && (
                    <Button size="sm" fullWidth onClick={() => setDepositOpen(true)}>
                      Deposit
                    </Button>
                  )}
                  <Button size="sm" fullWidth onClick={() => setWithdrawOpen(true)}>
                    Withdraw
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between px-4 py-2.5">
              {hasDeprecatedWallet ? (
                <button
                  type="button"
                  onClick={() => toggleIsUseOldWallet()}
                  className="cursor-pointer text-body text-ink-3 transition-colors hover:text-ink"
                >
                  {isUseOldWallet ? "Use current wallet" : "Use deprecated wallet"}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => disconnect()}
                className="cursor-pointer text-body font-medium text-short transition-colors hover:opacity-75"
              >
                Disconnect
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {tradeExecutor && (
        <>
          <DepositInterface
            open={depositOpen}
            onOpenChange={setDepositOpen}
            account={account}
            tradeExecutor={tradeExecutor}
          />
          <WithdrawInterface
            open={withdrawOpen}
            onOpenChange={setWithdrawOpen}
            account={account}
            tradeExecutor={tradeExecutor}
          />
        </>
      )}
    </>
  );
}
