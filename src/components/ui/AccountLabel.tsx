import { cn } from "@/utils/cn";
import { CHAIN_ID } from "@/utils/constants";
import { formatAddress } from "@/utils/format";
import type { Profile } from "@/utils/profile";
import { Avatar } from "./Avatar";
import { XLogoIcon } from "./icons";

const EXPLORER = "https://optimistic.etherscan.io/address";

/**
 * A wallet, as the user reads it: the display name they chose, else its ENS primary name, else
 * the truncated hex. The full address is always in the `title`, so nothing is hidden by the nicer
 * label, and the picture is always present — a Gravatar identicon when they have set none.
 *
 * A profile name is user-supplied, so `sanitizeDisplayName`/`displayNameError` in
 * `@/utils/profile` refuse anything shaped like an address or an ENS name before it can be
 * stored: this label links out to a block explorer, and a row that appears to name one wallet
 * while pointing at another is the one thing it must never do.
 */
export function AccountLabel({
  address,
  name,
  profile,
  className,
}: {
  address: string;
  /** Primary ENS name, from `useEnsNames`. Absent for the majority of wallets. */
  name?: string;
  /** Stored profile, from `useProfiles`. Absent for the majority of wallets. */
  profile?: Profile;
  className?: string;
}) {
  const label = profile?.displayName || name;

  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar address={address} src={profile?.avatarUrl} />
      <a
        href={`${EXPLORER}/${address}?chain=${CHAIN_ID}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "truncate text-data text-ink transition-colors hover:text-primary",
          // Hex needs the tabular face to stay scannable down a column; a name reads better set in
          // the body face.
          !label && "font-mono",
          className,
        )}
        title={address}
      >
        {label ?? formatAddress(address)}
      </a>
      {profile?.xHandle && (
        <a
          href={`https://x.com/${profile.xHandle}`}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={`@${profile.xHandle} on X`}
          className="shrink-0 text-ink-4 transition-colors hover:text-ink"
        >
          <XLogoIcon width={12} height={12} />
        </a>
      )}
    </span>
  );
}
