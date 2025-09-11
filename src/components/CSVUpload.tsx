import React, { useCallback } from "react";
import { useForm } from "react-hook-form";
import { PredictionRow } from "../types";
import { parseCSV } from "../utils/csvParser";

interface CSVUploadProps {
  onDataParsed: (data: PredictionRow[]) => void;
}

interface FormData {
  csvFile: FileList;
}

export const CSVUpload: React.FC<CSVUploadProps> = ({ onDataParsed }) => {
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
        const parsedData = parseCSV(text);
        onDataParsed(parsedData);
      } catch (error) {
        setError("csvFile", {
          message: error instanceof Error ? error.message : "Failed to parse CSV",
        });
      }
    },
    [onDataParsed, setError, clearErrors]
  );

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
            <div className="text-gray-600">repo,parent,weight</div>
            <div>https://github.com/a16z/helios,ethereum,0.01363775945</div>
            <div>https://github.com/ethereum/go-ethereum,ethereum,0.02100000</div>
            <div className="text-gray-400">...</div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Each row represents a prediction for a repository's weight in the Ethereum ecosystem
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select CSV File</label>
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

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-medium"
          >
            Upload and Analyze
          </button>
        </form>
      </div>
    </div>
  );
};
