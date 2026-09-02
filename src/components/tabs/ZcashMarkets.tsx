import { ContestBar } from "@/components/contest/ContestBar";
import { ContestChart } from "@/components/contest/ContestChart";
import { useContest } from "@/components/contest/contestState";
import { PredictionDropzone } from "@/components/predictions/PredictionDropzone";
import { ZcashTradingInterface } from "@/components/trade/ZcashTradingInterface";
import { Button, EmptyState, ErrorPanel, Panel } from "@/components/ui";
import { ZcashMarketTable } from "@/components/ZcashMarketTable";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useProcessZcashPredictions } from "@/hooks/useProcessZcashPredictions";
import { useRedeemZcash } from "@/hooks/useRedeemZcash";
import { useSellZcashToCollateral } from "@/hooks/useSellZcashToCollateral";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { useZcashMarketsData } from "@/hooks/useZcashMarketsData";
import { ZcashRow } from "@/types";
import { downloadCsv, isUndefined } from "@/utils/common";
import { tradeDisabledReason } from "@/utils/contest";
import { parseZcashCSV } from "@/utils/csvParser";
import { formatAmount } from "@/utils/format";
import { balancesResolved, redeemAvailability } from "@/utils/redeem";
import { isZcashRowFundable } from "@/utils/zcashBudget";
import { sampleZcashPredictions } from "@/utils/sampleZcashPredictions";
import { YES_INDEX } from "@/utils/zcashMarkets";
import { MarketStatus } from "@seer-pm/sdk";
import { startTransition, useCallback, useMemo, useState } from "react";
import { Address } from "viem";
import { GenericCSVUpload } from "../GenericCSVUpload";
import type { CSVFormatInfo, SampleCsvConfig } from "../GenericCSVUpload";
import { RedeemL2Interface } from "../trade/RedeemL2Interface";
import { SellAllTokensInterface } from "../trade/SellAllTokensInterface";

const ZCASH_CSV_FORMAT: CSVFormatInfo = {
  headers: "project,probability",
  exampleRows: ["Zcash Grants Hub,0.82", "ZODL Q1 2026 Core Protocol Development,0.15"],
  description:
    "One row per proposal, and how likely you think coinholders are to fund it — a number between 0 and 1, so 0.82 means 82%. Leave a proposal out of the file if you have no view on it and it will not be traded.",
};

const ZCASH_SAMPLE_CONFIG: SampleCsvConfig = {
  columns: [
    { key: "project", title: "project" },
    { key: "probability", title: "probability" },
  ],
  dataMapper: (row) => ({
    project: row.project,
    probability: row.probability,
  }),
  sampleData: sampleZcashPredictions,
  filename: "zcash-predictions",
};

export const ZcashMarkets = () => {
  const [predictions, setPredictions] = useLocalStorage<ZcashRow[]>("zcash-probability", []);
  const { finished } = useContest();
  const { account, tradeExecutor, canTrade } = useTradeWalletStatus();

  const [isSellAllDialogOpen, setIsSellAllDialogOpen] = useState(false);
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);

  const {
    data: tableData,
    isLoading,
    isFetching,
    isLoadingBalances,
    error,
    charts,
    marketIdToProject,
    totalVolumeMapping,
  } = useProcessZcashPredictions(predictions);

  // Raw market data for redeem scope (React Query dedupes with useProcessZcashPredictions).
  const { data: zcashMarketData } = useZcashMarketsData();

  const sellAll = useSellZcashToCollateral();
  const redeem = useRedeemZcash();

  const closedMarkets = useMemo(
    () =>
      (zcashMarketData?.markets ?? [])
        .filter((market) => market.marketStatus === MarketStatus.CLOSED)
        .map(({ id, wrappedTokens }) => ({ id, wrappedTokens })),
    [zcashMarketData?.markets],
  );

  // Every outcome token of every closed market, Invalid included — on this set a withdrawn
  // proposal resolves Invalid, so that token can be the only one worth redeeming.
  const closedTokens = useMemo(
    () => closedMarkets.flatMap((market) => market.wrappedTokens),
    [closedMarkets],
  );
  const { data: closedBalances, isLoading: isLoadingClosedBalances } = useTokensBalances(
    tradeExecutor as Address,
    closedTokens,
  );

  const chartData = useMemo(() => {
    if (!charts || !marketIdToProject) return undefined;
    return Object.entries(charts).map(([marketId, chartWithMarketData]) => {
      // Index 0 is YES — the number this pilot exists to publish.
      const { poolHourDatas, collateral, outcomeId } = chartWithMarketData[YES_INDEX];
      return {
        poolHourDatas,
        outcomeName: marketIdToProject[marketId],
        collateral,
        marketId,
        outcomeId,
      };
    });
  }, [charts, marketIdToProject]);

  const volumeLabel = useMemo(() => {
    if (!totalVolumeMapping) return undefined;
    const entries = Object.values(totalVolumeMapping);
    if (!entries.length) return undefined;
    const total = entries.reduce((acc, curr) => acc + Number(curr.split(" ")[0]), 0);
    return (
      <>
        Total volume <span className="font-mono text-ink">{formatAmount(total)} sUSDS</span> across{" "}
        {entries.length} markets
      </>
    );
  }, [totalVolumeMapping]);

  const hasSellTokens = useMemo(
    () => !!tableData?.filter((row) => row.yesBalance || row.noBalance)?.length,
    [tableData],
  );

  const hasRedeemable = useMemo(() => (closedBalances ?? []).some((b) => b > 0n), [closedBalances]);

  // Only a *confident* "nothing to claim" hides the button — see `@/utils/redeem`.
  const redeemState = redeemAvailability({
    hasRedeemable,
    isResolved:
      !isLoading &&
      !isLoadingBalances &&
      !!zcashMarketData &&
      balancesResolved(closedBalances, closedTokens),
  });

  // Same predicate the budget uses, so the button, the preflight count and the allocation cannot
  // disagree about which markets are in play.
  const tradableCount = useMemo(
    () => tableData?.filter(isZcashRowFundable).length ?? 0,
    [tableData],
  );

  // No pool exists on either side of any market. Pools were seeded on 2026-08-22, so this should
  // now be false; it stays because it is also what a re-seed window or a withdrawn pool set looks
  // like, and a table of "No pool" badges otherwise reads as a failure rather than a state.
  const hasNoLiquidity = useMemo(
    () =>
      !!tableData?.length &&
      tableData.every((row) => row.yesPrice === null && row.noPrice === null),
    [tableData],
  );

  const handleSellAll = useCallback(() => {
    if (!tableData || !tradeExecutor) return;
    sellAll.mutate({ tradeExecutor, tableData });
  }, [tableData, sellAll, tradeExecutor]);

  const exportMarketView = useCallback(() => {
    if (!tableData) return;
    downloadCsv(
      [
        { key: "project", title: "project" },
        { key: "probability", title: "probability" },
      ],
      // The market's own number, written in the format the upload expects: download it, edit the
      // rows you disagree with, upload it back.
      tableData.map((row) => ({
        project: row.project,
        probability: Number((row.yesPrice ?? 0).toFixed(4)),
      })),
      "zcash-market-view",
    );
  }, [tableData]);

  // Memoised: the tables are React.memo'd, and a freshly built element
  // here would re-render every row each time a dialog opens.
  const emptyState = useMemo(
    () => (
      <EmptyState
        title="Say how likely each grant is to get funded"
        description="Upload a file giving each proposal a probability between 0 and 1. It sits next to the market price so you can see where you disagree."
      >
        <PredictionDropzone
          className="w-full max-w-lg"
          compact
          parseFn={parseZcashCSV}
          onDataParsed={setPredictions}
        />
      </EmptyState>
    ),
    [setPredictions],
  );

  if (error) {
    return <ErrorPanel title="Market data could not be loaded" error={error} />;
  }

  const disabledReason =
    hasNoLiquidity && !isLoading
      ? "No liquidity has been seeded yet, so there is nothing to trade against."
      : tradeDisabledReason({
          hasPredictions: predictions.length > 0,
          hasDifferences: tradableCount > 0,
          isLoading,
        });

  return (
    <>
      <ContestChart
        data={isUndefined(chartData) ? undefined : chartData}
        isLoading={isLoading || isFetching}
        eyebrow="Zcash · Q3 2026"
        title="Approval odds over time"
        description="Each line is one proposal's YES price — the market's estimate of its chance of being approved."
        volume={volumeLabel}
      />

      {hasNoLiquidity && (
        <Panel tone="info" title="Not tradable yet">
          All 37 markets are live on Optimism, but no liquidity has been seeded, so there are no
          pools to price them. Predictions can be uploaded now. Prices and trading turn on once the
          pools exist.
        </Panel>
      )}

      <ContestBar
        predictionCount={predictions.length}
        onUpload={() => startTransition(() => setIsCsvDialogOpen(true))}
        onClear={() => startTransition(() => setPredictions([]))}
        actions={
          canTrade && (
            <>
              {/* Trading stops with the contest; claiming what you already hold does not. */}
              {!finished && (
                <Button
                  size="sm"
                  onClick={() => startTransition(() => setIsSellAllDialogOpen(true))}
                  disabled={!hasSellTokens}
                  disabledReason={!hasSellTokens ? "You hold no outcome tokens here." : undefined}
                >
                  Sell all positions
                </Button>
              )}
              {redeemState === "some" && (
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => startTransition(() => setIsRedeemDialogOpen(true))}
                  disabled={!account}
                >
                  Redeem to sUSDS
                </Button>
              )}
              {!finished && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => startTransition(() => setIsTradeDialogOpen(true))}
                  disabled={!!disabledReason || !account}
                  disabledReason={disabledReason}
                >
                  Start trading
                </Button>
              )}
            </>
          )
        }
      />

      <ZcashMarketTable
        markets={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
        emptyState={emptyState}
        onExport={exportMarketView}
        exportDisabled={!tableData || hasNoLiquidity}
      />

      <GenericCSVUpload<ZcashRow>
        open={isCsvDialogOpen}
        onOpenChange={setIsCsvDialogOpen}
        onDataParsed={setPredictions}
        parseFn={parseZcashCSV}
        formatInfo={ZCASH_CSV_FORMAT}
        sampleConfig={ZCASH_SAMPLE_CONFIG}
      />

      {tradeExecutor && tableData && (
        <ZcashTradingInterface
          open={isTradeDialogOpen}
          onOpenChange={setIsTradeDialogOpen}
          tradeExecutor={tradeExecutor}
          markets={tableData}
        />
      )}

      <SellAllTokensInterface
        open={isSellAllDialogOpen}
        onOpenChange={setIsSellAllDialogOpen}
        isError={sellAll.isError}
        error={sellAll.error}
        isPending={sellAll.isPending}
        isSuccess={sellAll.isSuccess}
        progress={sellAll.progress}
        reset={sellAll.reset}
        onSellAll={handleSellAll}
        isLoading={isLoading || isLoadingBalances}
        hasTokens={hasSellTokens}
      />

      <RedeemL2Interface
        open={isRedeemDialogOpen}
        onOpenChange={setIsRedeemDialogOpen}
        isError={redeem.isError}
        error={redeem.error}
        isPending={redeem.isPending}
        isSuccess={redeem.isSuccess}
        progress={redeem.progress}
        reset={redeem.reset}
        onRedeem={() => tradeExecutor && redeem.mutate({ tradeExecutor, markets: closedMarkets })}
        isLoading={isLoading || isLoadingBalances || isLoadingClosedBalances}
        hasRedeemable={hasRedeemable}
      />
    </>
  );
};
