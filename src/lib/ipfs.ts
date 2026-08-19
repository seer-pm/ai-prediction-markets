/**
 * Uploading a file to IPFS through Kleros's public pinning endpoint, and reading it back through
 * their gateway.
 *
 * This is the same pair Seer uses for market and outcome images (`web/src/lib/ipfs-publish.ts`
 * and the `https://cdn.kleros.link${path}` reads all over its market code). Borrowing it means
 * this app needs no storage bucket, no upload credentials and no service-role key — and what
 * comes back is an ordinary https URL, which is exactly what a profile already stores.
 *
 * The trade-off is a third-party dependency for hosting: if the gateway is down, avatars fall
 * back to their Gravatar identicon rather than breaking a row.
 */

const KLEROS_UPLOAD_ENDPOINT = "https://kleros-api.netlify.app/.netlify/functions/upload-to-ipfs";

/** The gateway the stored path is served from. */
export const IPFS_GATEWAY = "https://cdn.kleros.link";

interface UploadResponse {
  message?: string;
  /** Paths, not bare hashes — e.g. `/ipfs/QmZet68…`. */
  cids?: string[];
}

/**
 * Pin `data` and return its IPFS **path** (`/ipfs/<cid>`).
 *
 * `fileName` is preserved by the pinning service, so keep the real extension on it.
 */
export async function ipfsPublish(fileName: string, data: Blob): Promise<string> {
  const payload = new FormData();
  payload.append("file", data, fileName);

  const response = await fetch(`${KLEROS_UPLOAD_ENDPOINT}?operation=file&pinToGraph=true`, {
    method: "POST",
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`The upload service rejected the file (${response.status}).`);
  }

  const body = (await response.json().catch(() => ({}))) as UploadResponse;
  const path = body.cids?.[0];
  // A 200 with no cid means the pin silently failed; treating that as success would store an
  // empty URL and blank the avatar.
  if (!path) {
    throw new Error("The upload finished but returned no file. Please try again.");
  }
  return path;
}

/** The public URL for a path returned by `ipfsPublish`. */
export function ipfsUrl(path: string): string {
  return `${IPFS_GATEWAY}${path}`;
}
