import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BrandLockup, ThemeToggle } from "@seer-pm/ui-kit/react";
import { useAccount } from "wagmi";
import { BookIcon, ExternalIcon, MenuIcon } from "@/components/ui/icons";
import { TradeWalletMenu } from "@/components/trade/TradeWalletMenu";
import { WalletConnect } from "@/components/WalletConnect";
import { useTheme, useThemeStore } from "@/stores/themeStore";
import { cn } from "@/utils/cn";
import { GUIDE_URL } from "@/utils/constants";
import type { View } from "@/utils/views";

/** The views the header can open. The Round 3 withdraw page is reached only by its own link. */
const NAV: Array<{ view: View; label: string }> = [
  { view: "markets", label: "Markets" },
  { view: "leaderboard", label: "Leaderboard" },
];

interface AppHeaderProps {
  view: View;
  onNavigate: (view: View) => void;
  onOpenProfile: () => void;
  /** The page column, so the header's edges line up with the content's. */
  container: string;
}

/**
 * The lockup, the app's own pages, then the controls that change how it reads (guide, theme) and
 * the wallet last, as on every Seer app. Below `lg` the pages, the guide and the theme fold into one
 * menu so the full lockup and the wallet still fit a phone.
 *
 * Navigation is by button, not `<a href>`. An anchor navigates for real whenever the click is not
 * intercepted, which turns an in-app view switch into a full page load; `pushState` (in App) keeps
 * the URL linkable without ever handing the click back to the browser.
 */
export function AppHeader({ view, onNavigate, onOpenProfile, container }: AppHeaderProps) {
  const { address, isConnected } = useAccount();
  const theme = useTheme();
  const toggleTheme = useThemeStore((state) => state.toggle);
  // A profile needs an account to attach to. It opens a dialog rather than navigating, so it never
  // takes the `aria-current` treatment the pages get.
  const canEditProfile = isConnected && !!address;

  return (
    // Opaque, not frosted: a persistent backdrop-filter re-composites the page beneath it on
    // every scroll and reflow.
    <header className="sticky top-0 z-30 border-b border-rule bg-paper text-ink">
      <div className={cn(container, "flex h-16 items-center gap-2")}>
        <button
          type="button"
          onClick={() => onNavigate("markets")}
          aria-label="Seer Deep, markets"
          className="mr-auto flex min-w-0 cursor-pointer items-center gap-3 rounded-control"
        >
          <BrandLockup appName="Deep" />
          <span className="hidden text-label font-semibold tracking-wider text-ink-3 uppercase sm:inline">
            Optimism
          </span>
        </button>

        <nav aria-label="Pages" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
              aria-current={view === item.view ? "page" : undefined}
              className={cn(
                "seer-button seer-button-ghost",
                view === item.view && "bg-primary-bg text-primary-text hover:bg-primary-bg",
              )}
            >
              {item.label}
            </button>
          ))}
          {canEditProfile && (
            <button type="button" onClick={onOpenProfile} className="seer-button seer-button-ghost">
              Profile
            </button>
          )}
        </nav>

        <div className="hidden items-center gap-1 lg:flex">
          {/* After the pages, so leaving the app never reads as one more page of it. */}
          <a
            href={GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="seer-button seer-button-ghost text-primary-text"
          >
            <BookIcon />
            Guide
          </a>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>

        {isConnected ? <TradeWalletMenu /> : <WalletConnect />}

        {/* Radix locks body scroll in modal mode; `modal={false}` keeps the page from shifting. */}
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger
            className="seer-button seer-button-ghost seer-button-icon lg:hidden"
            aria-label="Menu"
          >
            <MenuIcon width={18} height={18} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              collisionPadding={12}
              className="z-50 min-w-56 overflow-hidden rounded-lg border border-rule bg-surface py-1 text-ink shadow-pop"
            >
              {NAV.map((item) => (
                <DropdownMenu.Item
                  key={item.view}
                  onSelect={() => onNavigate(item.view)}
                  aria-current={view === item.view ? "page" : undefined}
                  className={cn(
                    "flex cursor-pointer items-center px-4 py-2.5 text-body outline-none data-[highlighted]:bg-sunken",
                    view === item.view ? "font-semibold text-primary-text" : "text-ink",
                  )}
                >
                  {item.label}
                </DropdownMenu.Item>
              ))}
              {canEditProfile && (
                <DropdownMenu.Item
                  onSelect={onOpenProfile}
                  className="flex cursor-pointer items-center px-4 py-2.5 text-body text-ink outline-none data-[highlighted]:bg-sunken"
                >
                  Profile
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-rule" />
              <DropdownMenu.Item asChild>
                <a
                  href={GUIDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-body text-ink outline-none data-[highlighted]:bg-sunken"
                >
                  Guide
                  <ExternalIcon width={13} height={13} className="text-ink-3" />
                </a>
              </DropdownMenu.Item>
              {/* Keeps the menu open, so the reader sees the theme change and can flip it back. */}
              <DropdownMenu.Item
                onSelect={(event) => {
                  event.preventDefault();
                  toggleTheme();
                }}
                className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-body text-ink outline-none data-[highlighted]:bg-sunken"
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
                <span
                  className={cn("seer-icon text-ink-3", theme === "dark" ? "seer-icon-sun" : "seer-icon-moon")}
                  aria-hidden="true"
                />
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
