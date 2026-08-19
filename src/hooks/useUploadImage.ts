import { ipfsPublish, ipfsUrl } from "@/lib/ipfs";
import { useMutation } from "@tanstack/react-query";

/**
 * Same ceiling Seer puts on market images. An avatar is rendered at 24–48 px, so anything near
 * this is already far more than the display needs, and the pinning endpoint is a Netlify function
 * with its own request-size limit.
 */
export const MAX_IMAGE_BYTES = 500 * 1024;

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** For the file picker's `accept` attribute. */
export const ACCEPTED_IMAGE_ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");

/** Why this file cannot be uploaded, or null when it can. */
export function imageFileError(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Pick a PNG, JPEG, WebP or GIF.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    // Rounded up, so a file a byte over the limit never reports as being exactly at it.
    return `That image is ${Math.ceil(file.size / 1024)} KB. The limit is ${MAX_IMAGE_BYTES / 1024} KB.`;
  }
  return null;
}

/**
 * Upload an image and resolve to the https URL it is served from.
 *
 * Deliberately unaware of profiles: it hands back a URL, and the caller decides what to do with
 * it. Nothing is written to our own backend here — the profile is only saved when the user signs.
 */
export function useUploadImage() {
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const invalid = imageFileError(file);
      if (invalid) throw new Error(invalid);

      // Keep the real extension: the pinning service stores the name, and the gateway serves a
      // content type from it.
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = await ipfsPublish(`deep_pm_avatar_${Date.now()}.${extension}`, file);
      return ipfsUrl(path);
    },
  });
}
