import { L2Row } from "@/types";
import { downloadCsv } from "@/utils/common";
import { parseL2CSV } from "@/utils/csvParser";
import { sampleL2Predictions } from "@/utils/samepleL2Predictions";
import React, { useCallback } from "react";
import { useForm } from "react-hook-form";

interface CSVUploadProps {
  onDataParsed: (data: L2Row[]) => void;
  onClose: () => void;
}

interface FormData {
  csvFile: FileList;
}

export const L2CSVUpload: React.FC<CSVUploadProps> = ({ onDataParsed, onClose }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors,
  } = useForm<FormData>();

  const onSubmit = useCallback(
    async (data: FormData) => {
      try {
        clearErrors();
        const file = data.csvFile[0];
        if (!file) {
          setError("csvFile", { message: "Please select a CSV file" });
          return;
        }

        const text = await file.text();
        const parsedData = parseL2CSV(text);
        onDataParsed(parsedData);
        onClose();
      } catch (error) {
        setError("csvFile", {
          message: error instanceof Error ? error.message : "Failed to parse CSV",
        });
      }
    },
    [onDataParsed, setError, clearErrors],
  );
  const downloadSampleCsv = () => {
    downloadCsv(
      [
        {
          key: "dependency",
          title: "dependency",
        },
        {
          key: "repo",
          title: "repo",
        },
        {
          key: "weight",
          title: "weight",
        },
      ],
      sampleL2Predictions.map((row) => {
        return {
          repo: row.repo,
          dependency: row.dependency,
          weight: row.weight,
        };
      }),
      "l2-predictions",
    );
  };
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500 to-blue-500 px-6 py-4">
        <h2 className="text-2xl font-bold text-white">Upload Your Predictions</h2>
      </div>

      <div className="p-6">
        {/* CSV Format Example */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-2">Required CSV Format</h3>
          <div className="bg-white p-3 rounded border font-mono text-sm">
            <div className="text-gray-600">dependency,repo,weight</div>
            <div className="break-all">
              https://github.com/rust-lang/cc-rs,https://github.com/supranational/blst,0.01363775945
            </div>
            <div className="break-all">
              https://github.com/eth-clients/holesky,https://github.com/status-im/nimbus-eth2,0.02100000
            </div>
            <div className="text-gray-400">...</div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Each row represents a prediction for a repository's dependency weight
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="block text-sm font-medium text-gray-700">Select CSV File</label>
              <button
                type="button"
                onClick={() => downloadSampleCsv()}
                className="hover:underline cursor-pointer text-gray-500 text-sm"
              >
                Download Sample CSV
              </button>
            </div>
            <input
              {...register("csvFile", { required: "CSV file is required" })}
              type="file"
              accept=".csv"
              className="w-full p-3 border-2 border-dashed border-gray-300 rounded-md hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 transition-colors"
            />
            {errors.csvFile && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600 text-sm">{errors.csvFile.message}</p>
              </div>
            )}
          </div>
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer flex-1 bg-gray-300 text-gray-700 py-4 px-6 rounded-md hover:bg-gray-400 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Load Predictions
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
