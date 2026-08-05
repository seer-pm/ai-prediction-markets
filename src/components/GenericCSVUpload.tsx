import { Button, Dialog } from "@/components/ui";
import { DownloadIcon } from "@/components/ui/icons";
import { downloadCsv } from "@/utils/common";
import { PredictionDropzone } from "./predictions/PredictionDropzone";

export interface CSVFormatInfo {
  /** CSV headers line, e.g. "repo,parent,weight" */
  headers: string;
  /** Example CSV rows displayed in the format box */
  exampleRows: string[];
  /** Description below the format box */
  description: string;
}

export interface SampleCsvConfig {
  columns: { key: string; title: string }[];
  /** Maps each sample item to a flat record matching the columns */
  // biome-ignore lint/suspicious/noExplicitAny: sample rows vary per contest
  dataMapper: (item: any) => Record<string, any>;
  // biome-ignore lint/suspicious/noExplicitAny: sample rows vary per contest
  sampleData: any[];
  filename: string;
}

interface GenericCSVUploadProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataParsed: (data: T[]) => void;
  parseFn: (text: string) => T[];
  formatInfo: CSVFormatInfo;
  sampleConfig: SampleCsvConfig;
}

export function GenericCSVUpload<T>({
  open,
  onOpenChange,
  onDataParsed,
  parseFn,
  formatInfo,
  sampleConfig,
}: GenericCSVUploadProps<T>) {
  const downloadSampleCsv = () =>
    downloadCsv(
      sampleConfig.columns,
      sampleConfig.sampleData.map(sampleConfig.dataMapper),
      sampleConfig.filename,
    );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload predictions"
      description={formatInfo.description}
      size="md"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-rule bg-sunken px-4 py-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-label font-semibold tracking-wider text-ink-3 uppercase">
              Expected columns
            </p>
            <Button size="sm" variant="ghost" onClick={downloadSampleCsv} iconLeft={<DownloadIcon />}>
              Sample CSV
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-md border border-rule bg-surface p-3 font-mono text-micro leading-relaxed text-ink-2">
            <span className="text-ink-3">{formatInfo.headers}</span>
            {formatInfo.exampleRows.map((row) => `\n${row}`)}
            <span className="text-ink-4">{"\n…"}</span>
          </pre>
        </div>

        <PredictionDropzone
          parseFn={parseFn}
          onDataParsed={(rows) => {
            onDataParsed(rows);
            onOpenChange(false);
          }}
        />
      </div>
    </Dialog>
  );
}
