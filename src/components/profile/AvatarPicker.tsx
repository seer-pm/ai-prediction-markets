import { Avatar, Button, Spinner, TextInput } from "@/components/ui";
import { UploadIcon } from "@/components/ui/icons";
import {
  ACCEPTED_IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
  imageFileError,
  useUploadImage,
} from "@/hooks/useUploadImage";
import { cn } from "@/utils/cn";
import { useRef, useState } from "react";

/**
 * Choose a profile picture: drop a file, pick one, or paste a link.
 *
 * The stored value is always a URL — uploading just fills it in — so the link field stays visible
 * rather than being an "advanced" mode. It is also the only way to see or clear what is currently
 * set when that came from somewhere else.
 *
 * Drag-and-drop is hand-rolled to match `PredictionDropzone`, the app's other drop target, rather
 * than pulling in `react-dropzone` for one field.
 */
export function AvatarPicker({
  address,
  value,
  onChange,
  /** Set when the parent's own validation rejects the URL. */
  error,
}: {
  address: string;
  value: string;
  onChange: (url: string) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string>();
  const upload = useUploadImage();

  const take = (file: File | undefined) => {
    if (!file) return;
    setRejected(undefined);
    // Checked here as well as inside the mutation so an obviously wrong file never costs a
    // round trip.
    const invalid = imageFileError(file);
    if (invalid) {
      setRejected(invalid);
      return;
    }
    upload.mutate(file, { onSuccess: onChange });
  };

  const uploadError = rejected ?? (upload.error instanceof Error ? upload.error.message : undefined);

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          take(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex items-center gap-4 rounded-lg border-2 border-dashed px-4 py-4 transition-colors",
          dragging ? "border-primary bg-primary-bg" : "border-rule-strong bg-surface",
        )}
      >
        {/* Falls back to the address's Gravatar identicon, so this is a true preview of the row
            even before anything is chosen. */}
        <Avatar address={address} src={error ? undefined : value} size={56} />

        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-body text-ink-3">
            {upload.isPending ? (
              <span className="inline-flex items-center gap-2 text-ink">
                <Spinner size={14} />
                Uploading…
              </span>
            ) : (
              <>
                Drop an image here, or{" "}
                <span className="text-ink">PNG, JPEG, WebP or GIF up to {MAX_IMAGE_BYTES / 1024} KB.</span>
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending}
              iconLeft={<UploadIcon />}
            >
              Choose image
            </Button>
            {value && !upload.isPending && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onChange("");
                  setRejected(undefined);
                  upload.reset();
                }}
              >
                Remove
              </Button>
            )}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            take(event.target.files?.[0]);
            // Cleared so picking the same file twice still fires a change.
            event.target.value = "";
          }}
        />
      </div>

      <TextInput
        type="url"
        value={value}
        placeholder="…or paste a direct https link"
        onChange={(event) => {
          onChange(event.target.value);
          setRejected(undefined);
        }}
      />

      {uploadError && <p className="text-body text-short">{uploadError}</p>}
    </div>
  );
}
