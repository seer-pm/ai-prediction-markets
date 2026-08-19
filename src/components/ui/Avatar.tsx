import { cn } from "@/utils/cn";
import { gravatarUrl } from "@/utils/profile";
import { useEffect, useState } from "react";

/**
 * A wallet's picture: whatever they set, falling back to a Gravatar identicon derived from the
 * address — so a row without a profile still gets a stable, distinct mark rather than a blank
 * circle shared with every other unprofiled wallet.
 *
 * `referrerPolicy="no-referrer"` because the src is an arbitrary user-supplied host: there is no
 * reason to tell it which page of ours the reader is on.
 */
export function Avatar({
  address,
  src,
  size = 24,
  className,
}: {
  address: string;
  /** The profile's `avatarUrl`, if they set one. */
  src?: string;
  size?: number;
  className?: string;
}) {
  const fallback = gravatarUrl(address, size * 2);
  const [failed, setFailed] = useState(false);

  // A new src deserves its own attempt; without this, one broken link would pin the fallback on
  // for the rest of the session even after the user fixes it.
  useEffect(() => setFailed(false), [src]);

  return (
    <img
      src={!src || failed ? fallback : src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-full bg-sunken object-cover", className)}
    />
  );
}
