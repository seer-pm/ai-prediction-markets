import { cn } from "@/utils/cn";
import { CHAIN_ID } from "@/utils/constants";
import { formatAddress } from "@/utils/format";

const EXPLORER = "https://optimistic.etherscan.io/address";

/**
 * A wallet, as the user reads it: its ENS primary name when it has one, the truncated hex
 * otherwise. The full address is always in the `title`, so nothing is hidden by the nicer label.
 */
export function AccountLabel({
  address,
  name,
  className,
}: {
  address: string;
  /** Primary ENS name, from `useEnsNames`. Absent for the majority of wallets. */
  name?: string;
  className?: string;
}) {
  return (
    <a
      href={`${EXPLORER}/${address}?chain=${CHAIN_ID}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "text-data text-ink transition-colors hover:text-primary",
        // Hex needs the tabular face to stay scannable down a column; a name reads better set in
        // the body face.
        !name && "font-mono",
        className,
      )}
      title={address}
    >
      {name ?? formatAddress(address)}
    </a>
  );
}
