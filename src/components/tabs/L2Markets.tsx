import { useCheckTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { useL2MarketsData } from "@/hooks/useL2MarketsData";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useProcessL2Predictions } from "@/hooks/useProcessL2Predictions";
import { useRedeemL2 } from "@/hooks/useRedeemL2";
import { useSellL2ToCollateral } from "@/hooks/useSellL2ToCollateral";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { DownloadIcon } from "@/lib/icons";
import { L2Row } from "@/types";
import { downloadCsv, isUndefined, minBigIntArray } from "@/utils/common";
import { parseL2CSV } from "@/utils/csvParser";
import { sampleL2Predictions } from "@/utils/samepleL2Predictions";
import { MarketStatus } from "@seer-pm/sdk";
import { startTransition, useCallback, useMemo, useState } from "react";
import "react-toastify/dist/ReactToastify.css";
import { useAccount } from "wagmi";
import { Address } from "viem";
import { GenericCSVUpload } from "../GenericCSVUpload";
import type { CSVFormatInfo, SampleCsvConfig } from "../GenericCSVUpload";
import { L2MarketTable } from "../L2MarketTable";
import { L2TradingInterface } from "../trade/L2TradingInterface";
import { RedeemL2Interface } from "../trade/RedeemL2Interface";
import { SellAllTokensInterface } from "../trade/SellAllTokensInterface";
import L2Charts from "./L2Charts";
import { useWalletStore } from "@/stores/walletStore";
import { Modal } from "../Modal";

const L2_CSV_FORMAT: CSVFormatInfo = {
  headers: "dependency,repo,weight",
  exampleRows: [
    "https://github.com/rust-lang/cc-rs,https://github.com/supranational/blst,0.01363775945",
    "https://github.com/eth-clients/holesky,https://github.com/status-im/nimbus-eth2,0.02100000",
  ],
  description: "Each row represents a prediction for a repository's dependency weight",
};

const L2_SAMPLE_CONFIG: SampleCsvConfig = {
  columns: [
    { key: "dependency", title: "dependency" },
    { key: "repo", title: "repo" },
    { key: "weight", title: "weight" },
  ],
  dataMapper: (row) => ({
    repo: row.repo,
    dependency: row.dependency,
    weight: row.weight,
  }),
  sampleData: sampleL2Predictions,
  filename: "l2-predictions",
};

export const L2Markets = () => {
  const { address: account } = useAccount();
  const [predictions, setPredictions] = useLocalStorage<L2Row[]>("l2-default", []);

  const { data: checkTradeExecutorResult } = useCheckTradeExecutorCreated(account);
  const [isSellAllDialogOpen, setIsSellAllDialogOpen] = useState(false);
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);
  const isUseOldWallet = useWalletStore((s) => s.isUseOldWallet);

  const { data: l2Data } = useL2MarketsData();

  const {
    data: tableData,
    isLoading,
    isLoadingBalances,
    error,
    charts,
    totalVolumeMapping,
  } = useProcessL2Predictions(predictions);

  const sellAll = useSellL2ToCollateral(() => {
    closeSellAllDialog();
  });

  const closedMarkets = useMemo(
    () =>
      (l2Data?.markets ?? [])
        .filter((m) => m.marketStatus === MarketStatus.CLOSED)
        .map(({ id, collateralToken, wrappedTokens }) => ({ id, collateralToken, wrappedTokens })),
    [l2Data?.markets],
  );

  const closedMarketIds = useMemo(
    () => new Set(closedMarkets.map((m) => m.id.toLowerCase())),
    [closedMarkets],
  );

  const redeem = useRedeemL2(() => {
    closeRedeemDialog();
  });

  const collateralTokens = useMemo(
    () => Array.from(new Set(tableData?.map((x) => x.collateralToken) ?? [])),
    [tableData],
  );
  const { data: balances, isLoading: isLoadingSellBalances } = useTokensBalances(
    checkTradeExecutorResult?.predictedAddress as Address,
    collateralTokens,
  );

  const repoOptions = useMemo(
    () =>
      tableData
        ? Array.from(
            new Map(tableData.map((x) => [x.repo, { text: x.repo, id: x.marketId }])).values(),
          ).sort((a, b) => (a.text.toLowerCase() > b.text.toLowerCase() ? 1 : -1))
        : [],
    [tableData],
  );

  const handleDataParsed = (data: L2Row[]) => {
    setPredictions(data);
  };

  const handleStartTrading = useCallback(() => {
    startTransition(() => setIsTradeDialogOpen(true));
  }, []);

  const handleLoadPredictions = useCallback(() => {
    startTransition(() => setIsCsvDialogOpen(true));
  }, []);

  const closeCsvDialog = useCallback(() => startTransition(() => setIsCsvDialogOpen(false)), []);
  const closeTradeDialog = useCallback(
    () => startTransition(() => setIsTradeDialogOpen(false)),
    [],
  );
  const closeSellAllDialog = useCallback(
    () => startTransition(() => setIsSellAllDialogOpen(false)),
    [],
  );
  const closeRedeemDialog = useCallback(
    () => startTransition(() => setIsRedeemDialogOpen(false)),
    [],
  );

  const handleSellAll = useCallback(() => {
    if (!tableData) return;
    sellAll.mutate({ tradeExecutor: checkTradeExecutorResult?.predictedAddress!, tableData });
  }, [tableData, sellAll, checkTradeExecutorResult?.predictedAddress]);

  const hasMergeAmount = minBigIntArray(balances ?? []) > 0n;
  const hasSellTokens = useMemo(
    () => !!tableData?.filter((x) => x.balance)?.length || hasMergeAmount,
    [tableData, hasMergeAmount],
  );

  const hasRedeemable = useMemo(
    () =>
      !!tableData?.some(
        (row) => closedMarketIds.has(row.marketId.toLowerCase()) && (row.balance ?? 0n) > 0n,
      ),
    [tableData, closedMarketIds],
  );

  const exportWeight = useCallback(() => {
    if (!tableData) return;
    downloadCsv(
      [
        { key: "dependency", title: "dependency" },
        { key: "repo", title: "repo" },
        { key: "weight", title: "weight" },
      ],
      tableData
        .filter((row) => !row.dependency.includes("Invalid result"))
        .map((row) => ({
          repo: row.repo,
          dependency: row.dependency,
          weight: row.currentPrice ?? 0,
        })),
      "l2-weights",
    );
  }, [tableData]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-800">Error loading market data: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-5 drop-shadow bg-white rounded-lg">
        {!isUndefined(charts) ? (
          <L2Charts
            repoOptions={repoOptions}
            charts={charts}
            totalVolumeMapping={totalVolumeMapping!}
          />
        ) : (
          <>
            {isLoading ? (
              <div className="animate-pulse">
                <div className="h-40 bg-gray-300 rounded"></div>
              </div>
            ) : (
              <p>No Chart Data</p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
          {predictions.length > 0 && (
            <button
              onClick={() => startTransition(() => setPredictions([]))}
              className="cursor-pointer text-red-600 hover:text-red-800 text-sm font-medium px-4 py-2 border border-red-300 rounded-md hover:bg-red-50 transition-colors w-full sm:w-auto text-center"
            >
              Clear Predictions
            </button>
          )}

          <button
            onClick={handleLoadPredictions}
            className="cursor-pointer text-blue-600 hover:text-blue-800 text-sm font-medium px-4 py-2 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors w-full sm:w-auto text-center"
          >
            {predictions.length > 0 ? "Change Predictions" : "Upload Predictions"}
          </button>

          {checkTradeExecutorResult?.isCreated && !isUseOldWallet && (
            <>
              <button
                disabled={!tableData || isLoading || !account}
                onClick={() => startTransition(() => setIsSellAllDialogOpen(true))}
                className="cursor-pointer px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sell all to sUSDS
              </button>
              <button
                disabled={!hasRedeemable || isLoading || !account}
                onClick={() => startTransition(() => setIsRedeemDialogOpen(true))}
                className="cursor-pointer px-5 py-2.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Redeem to sUSDS
              </button>
              <button
                onClick={handleStartTrading}
                disabled={
                  !tableData ||
                  tableData.filter((x) => x.difference).length === 0 ||
                  isLoading ||
                  !account ||
                  !checkTradeExecutorResult?.isCreated
                }
                className="cursor-pointer bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 rounded-md hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium w-full sm:w-auto text-center"
              >
                🚀 Start Trading
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex justify-between">
        <h2 className="text-xl font-semibold">Loaded {predictions.length} predictions</h2>
        {tableData && (
          <button
            className="hover:underline hover:opacity-70 cursor-pointer flex gap-1"
            onClick={() => exportWeight()}
          >
            <DownloadIcon />
            <p>Export current weight</p>
          </button>
        )}
      </div>
      <L2MarketTable
        rows={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
      />

      {/* CSV Dialog */}
      <Modal isOpen={isCsvDialogOpen} onClose={closeCsvDialog} maxWidth="max-w-2xl">
        <GenericCSVUpload<L2Row>
          onDataParsed={handleDataParsed}
          onClose={closeCsvDialog}
          parseFn={parseL2CSV}
          formatInfo={L2_CSV_FORMAT}
          sampleConfig={L2_SAMPLE_CONFIG}
        />
      </Modal>

      {/* Trading Dialog */}
      <Modal isOpen={isTradeDialogOpen && !!tableData} onClose={closeTradeDialog}>
        {tableData && (
          <L2TradingInterface
            tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
            rows={tableData}
            onClose={closeTradeDialog}
            isLoadingBalances={isLoadingBalances}
          />
        )}
      </Modal>

      {/* Sell All Dialog */}
      <Modal isOpen={isSellAllDialogOpen} onClose={closeSellAllDialog}>
        <SellAllTokensInterface
          onClose={closeSellAllDialog}
          subtitle="Sell all positions to sUSDS"
          isError={sellAll.isError}
          error={sellAll.error}
          isPending={sellAll.isPending}
          txState={sellAll.txState}
          reset={sellAll.reset}
          onSellAll={handleSellAll}
          isLoading={isLoadingSellBalances || isLoading || isLoadingBalances}
          hasTokens={hasSellTokens}
        />
      </Modal>

      {/* Redeem Dialog */}
      <Modal isOpen={isRedeemDialogOpen} onClose={closeRedeemDialog}>
        <RedeemL2Interface
          onClose={closeRedeemDialog}
          isError={redeem.isError}
          error={redeem.error}
          isPending={redeem.isPending}
          txState={redeem.txState}
          reset={redeem.reset}
          onRedeem={() => {
            redeem.mutate({
              tradeExecutor: checkTradeExecutorResult?.predictedAddress!,
              closedMarkets,
            });
          }}
          isLoading={isLoadingSellBalances || isLoading || isLoadingBalances}
          hasRedeemable={hasRedeemable}
        />
      </Modal>
    </>
  );
};
