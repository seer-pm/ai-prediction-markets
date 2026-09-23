import { Button } from "@/components/ui";
import { CheckIcon, UploadIcon } from "@/components/ui/icons";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { cn } from "@/utils/cn";
import { useCallback, useRef, useState } from "react";

interface PredictionDropzoneProps<T> {
  parseFn: (text: string) => T[];
  onDataParsed: (rows: T[]) => void;
  /**
   * The tab's predictions storage key. The loaded file's name is kept beside it, so every dropzone
   * of a tab — the empty table's and the upload dialog's — names the same file.
   */
  storageKey: string;
  /** How many predictions the tab holds now; 0 means no file is loaded, whatever name is stored. */
  loadedCount: number;
  /** Compact form for the empty-table state; full form for the dialog. */
  compact?: boolean;
  className?: string;
}

/**
 * The one place a predictions file enters the app. Used by the upload dialog
 * and by the empty table, so a fresh tab is itself a drop target rather than a
 * blank page pointing at a button somewhere else.
 */
export function PredictionDropzone<T>({
  parseFn,
  onDataParsed,
  storageKey,
  loadedCount,
  compact = false,
  className,
}: PredictionDropzoneProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();
  const [fileName, setFileName] = useLocalStorage(`${storageKey}-file`, "");
  const hasFile = loadedCount > 0;

  const readFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(undefined);
      try {
        const rows = parseFn(await file.text());
        if (rows.length === 0) {
          setError("That file parsed to zero rows. Check the column headers and try again.");
          return;
        }
        setFileName(file.name);
        onDataParsed(rows);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That file could not be read as CSV.");
      }
    },
    [parseFn, onDataParsed, setFileName],
  );

  return (
    <div className={className}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          readFile(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed text-center transition-colors",
          compact ? "px-6 py-8" : "px-6 py-10",
          dragging ? "border-primary bg-primary-bg" : "border-rule-strong bg-surface",
        )}
      >
        <span className={hasFile ? "text-long" : "text-ink-3"}>
          {hasFile ? <CheckIcon width={24} height={24} /> : <UploadIcon width={24} height={24} />}
        </span>
        {hasFile ? (
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-lede font-semibold break-all text-ink">
              {fileName || "Predictions file"}
            </p>
            <p className="text-body text-ink-3">
              {loadedCount} {loadedCount === 1 ? "prediction" : "predictions"} loaded · drop another
              file to replace it
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-lede font-semibold text-ink">Drop your predictions CSV here</p>
            <p className="text-body text-ink-3">or choose a file from your computer</p>
          </div>
        )}
        <Button size="sm" onClick={() => inputRef.current?.click()}>
          {hasFile ? "Replace file" : "Choose file"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            readFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      {error && <p className="mt-2 text-body text-short">{error}</p>}
    </div>
  );
}
