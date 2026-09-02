import { ContestBar } from "@/components/contest/ContestBar";
import { useContest } from "@/components/contest/contestState";
import { tradeDisabledReason } from "@/utils/contest";
import { ContestChart } from "@/components/contest/ContestChart";
import { PredictionDropzone } from "@/components/predictions/PredictionDropzone";
import { Button, EmptyState, ErrorPanel } from "@/components/ui";
import { useL1MarketsData } from "@/hooks/useL1MarketsData";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useProcessL1Predictions } from "@/hooks/useProcessL1Predictions";
import { useRedeemL1 } from "@/hooks/useRedeemL1";
import { useSellL1ToCollateral } from "@/hooks/useSellL1ToCollateral";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { useTradeWalletStatus } from "@/hooks/useTradeWalletStatus";
import { PredictionRow } from "@/types";
import { downloadCsv, isUndefined } from "@/utils/common";
import { COLLATERAL_TOKENS, CHAIN_ID } from "@/utils/constants";
import { parseCSV } from "@/utils/csvParser";
import { formatAmount } from "@/utils/format";
import {
  balancesResolved,
  payoutRatios,
  redeemAvailability,
  redeemableValue,
  winningPositionCount,
} from "@/utils/redeem";
import { sampleL1Predictions } from "@/utils/sampleL1Predictions";
import { MarketStatus } from "@seer-pm/sdk";
import { startTransition, useCallback, useMemo, useState } from "react";
import { Address } from "viem";
import { GenericCSVUpload } from "../GenericCSVUpload";
import type { CSVFormatInfo, SampleCsvConfig } from "../GenericCSVUpload";
import { L1MarketTable } from "../L1MarketTable";
import { RedeemL2Interface } from "../trade/RedeemL2Interface";
import { SellAllTokensInterface } from "../trade/SellAllTokensInterface";
import { TradingInterface } from "../trade/TradingInterface";

const L1_CSV_FORMAT: CSVFormatInfo = {
  headers: "repo,parent,weight",
  exampleRows: [
    "https://github.com/a16z/helios,ethereum,0.01363775945",
    "https://github.com/ethereum/go-ethereum,ethereum,0.02100000",
  ],
  description: "One row per repository: its URL, its parent ecosystem, and the weight you predict.",
};

const L1_SAMPLE_CONFIG: SampleCsvConfig = {
  columns: [
    { key: "repo", title: "repo" },
    { key: "parent", title: "parent" },
    { key: "weight", title: "weight" },
  ],
  dataMapper: (row) => ({
    repo: `https://github.com/${row.item}`,
    parent: "ethereum",
    weight: row.weight,
  }),
  sampleData: sampleL1Predictions,
  filename: "l1-predictions",
};

export const L1Markets = () => {
  const [predictions, setPredictions] = useLocalStorage<PredictionRow[]>("l1-default", []);
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
    totalVolumeMapping,
  } = useProcessL1Predictions(predictions);

  const sellAll = useSellL1ToCollateral();
  const redeem = useRedeemL1();

  // Redeem needs each level's tokens in outcome order. `tableData` is sorted by price and mixes
  // both markets, so a row index no longer matches an on-chain outcome index.
  // React Query dedupes this read with useProcessL1Predictions.
  //
  // Optional all the way down, not just on `l1Data`: the query is persisted to localStorage, so a
  // visitor whose cache was written before these two levels existed restores a `l1Data` that has
  // neither, and the unguarded `.wrappedTokens` took the whole contest panel down on first paint —
  // before the refetch that would have filled them in.
  const { data: l1Data } = useL1MarketsData();
  const parentTokens = useMemo(
    () => l1Data?.parentMarket?.wrappedTokens ?? [],
    [l1Data?.parentMarket?.wrappedTokens],
  );
  const otherTokens = useMemo(
    () => l1Data?.otherMarket?.wrappedTokens ?? [],
    [l1Data?.otherMarket?.wrappedTokens],
  );

  const { data: parentBalances, isLoading: isLoadingParentBalances } = useTokensBalances(
    tradeExecutor as Address,
    parentTokens,
  );
  const { data: otherBalances, isLoading: isLoadingOtherBalances } = useTokensBalances(
    tradeExecutor as Address,
    otherTokens,
  );

  // Each level settles on its own Reality questions, so each is gated on its own status.
  const parentClosed = l1Data?.parentMarket?.marketStatus === MarketStatus.CLOSED;
  const otherClosed = l1Data?.otherMarket?.marketStatus === MarketStatus.CLOSED;

  // What a claim is worth, level by level.
  //
  // A parent token settles at its share of the parent payout. A child token settles at its share of
  // the *child* payout, but paid in the parent's outcome-`parentOutcome` token — the carrier that
  // collateralizes the child — so its value chains through that outcome's own ratio. Same math as
  // `scripts/exportL1Pnl.ts`; the redeem run does both hops back to back, so one figure covers it.
  const parentRatios = useMemo(
    () => payoutRatios(l1Data?.parentMarket?.payoutNumerators),
    [l1Data?.parentMarket?.payoutNumerators],
  );
  const otherRatios = useMemo(() => {
    const carrier = parentRatios[l1Data?.otherMarket?.parentOutcome ?? -1] ?? 0;
    if (!carrier) return [];
    return payoutRatios(l1Data?.otherMarket?.payoutNumerators).map((ratio) => ratio * carrier);
  }, [parentRatios, l1Data?.otherMarket?.parentOutcome, l1Data?.otherMarket?.payoutNumerators]);

  // Only a closed level is counted, matching exactly what `handleRedeem` will attempt.
  const payout = useMemo(() => {
    // No ratios for a level we would claim — a persisted snapshot written before the API carried
    // them, or a child whose carrier outcome has not resolved, so its tokens cannot reach sUSDS in
    // this run at all. We do not know what it pays, so the dialog says nothing rather than a zero.
    if (parentClosed && parentRatios.length === 0) return undefined;
    if (otherClosed && otherRatios.length === 0) return undefined;
    const decimals = COLLATERAL_TOKENS[CHAIN_ID].primary.decimals;
    const parent = parentClosed ? parentBalances : undefined;
    const other = otherClosed ? otherBalances : undefined;
    return {
      amount:
        redeemableValue(parent, parentRatios, decimals) +
        redeemableValue(other, otherRatios, decimals),
      positions:
        winningPositionCount(parent, parentRatios) + winningPositionCount(other, otherRatios),
      symbol: COLLATERAL_TOKENS[CHAIN_ID].primary.symbol,
    };
  }, [parentClosed, otherClosed, parentBalances, otherBalances, parentRatios, otherRatios]);

  const hasRedeemable = useMemo(
    () =>
      (parentClosed && (parentBalances ?? []).some((b) => b > 0n)) ||
      (otherClosed && (otherBalances ?? []).some((b) => b > 0n)),
    [parentClosed, otherClosed, parentBalances, otherBalances],
  );

  const volumeLabel = useMemo(() => {
    const volumeString = Object.values(totalVolumeMapping ?? {})[0];
    if (!volumeString) return undefined;
    const [volume] = volumeString.split(" ");
    return (
      <>
        Volume <span className="font-mono text-ink">{formatAmount(Number(volume))} sUSDS</span>
      </>
    );
  }, [totalVolumeMapping]);

  const chartData = useMemo(() => {
    // `charts` can be a present-but-empty object, so the first entry is not guaranteed — indexing
    // straight into `[0].filter` threw and took the whole contest panel down with it.
    const first = charts && Object.values(charts)[0];
    if (!first) return undefined;
    return first.filter(
      (x) =>
        !["invalid result", "other repositories"].some((name) =>
          x.outcomeName.toLowerCase().includes(name),
        ),
    );
  }, [charts]);

  const tradableCount = useMemo(
    () => tableData?.filter((row) => row.difference).length ?? 0,
    [tableData],
  );

  const hasSellTokens = useMemo(
    () => !!tableData?.filter((row) => row.currentPrice && row.balance)?.length,
    [tableData],
  );

  const handleRedeem = useCallback(() => {
    if (!tradeExecutor) return;
    // A level that has not closed is left out entirely rather than attempted and reverted.
    redeem.mutate({
      tradeExecutor,
      otherMarket: otherClosed && l1Data ? l1Data.otherMarket : undefined,
      parentTokens: parentClosed ? parentTokens : undefined,
    });
  }, [tradeExecutor, redeem, otherClosed, parentClosed, l1Data, parentTokens]);

  const handleSellAll = useCallback(() => {
    if (!tableData || !tradeExecutor) return;
    sellAll.mutate({ tradeExecutor, tableData });
  }, [tableData, sellAll, tradeExecutor]);

  const exportWeight = useCallback(() => {
    if (!tableData) return;
    downloadCsv(
      [
        { key: "repo", title: "repo" },
        { key: "parent", title: "parent" },
        { key: "weight", title: "weight" },
      ],
      tableData
        .filter(
          (row) => !row.repo.includes("Other repositories") && !row.repo.includes("Invalid result"),
        )
        .map((row) => ({ repo: row.repo, parent: "ethereum", weight: row.currentPrice ?? 0 })),
      "l1-weights",
    );
  }, [tableData]);

  // Memoised: the tables are React.memo'd, and a freshly built element
  // here would re-render every row each time a dialog opens.
  const emptyState = useMemo(
    () => (
    <EmptyState
      title="Load your predictions to see your edge"
      description="A CSV of predicted repository weights, diffed against what the market currently prices."
    >
      <PredictionDropzone
        className="w-full max-w-lg"
        compact
        parseFn={parseCSV}
        onDataParsed={setPredictions}
      />
    </EmptyState>
    ),
    [setPredictions],
  );

  if (error) {
    return <ErrorPanel title="Market data could not be loaded" error={error} />;
  }

  const disabledReason = tradeDisabledReason({
    hasPredictions: predictions.length > 0,
    hasDifferences: tradableCount > 0,
    isLoading,
  });

  // Only a *confident* "nothing to claim" hides the button — see `@/utils/redeem`.
  const redeemState = redeemAvailability({
    hasRedeemable,
    isResolved:
      !isLoading &&
      !isLoadingBalances &&
      // Both levels, not just `l1Data`: a pre-redeem persisted snapshot restores without them, and
      // the empty token lists would otherwise read as a confident "nothing to claim".
      l1Data?.parentMarket !== undefined &&
      l1Data?.otherMarket !== undefined &&
      balancesResolved(parentBalances, parentTokens) &&
      balancesResolved(otherBalances, otherTokens),
  });

  return (
    <>
      <ContestChart
        data={isUndefined(chartData) ? undefined : chartData}
        isLoading={isLoading || isFetching}
        eyebrow="Round 2 · L1"
        title="Repository weight in the Ethereum ecosystem"
        volume={volumeLabel}
      />

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

      <L1MarketTable
        rows={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
        emptyState={emptyState}
        onExport={exportWeight}
        exportDisabled={!tableData}
      />

      <GenericCSVUpload<PredictionRow>
        open={isCsvDialogOpen}
        onOpenChange={setIsCsvDialogOpen}
        onDataParsed={setPredictions}
        parseFn={parseCSV}
        formatInfo={L1_CSV_FORMAT}
        sampleConfig={L1_SAMPLE_CONFIG}
      />

      {tradeExecutor && tableData && (
        <TradingInterface
          open={isTradeDialogOpen}
          onOpenChange={setIsTradeDialogOpen}
          tradeExecutor={tradeExecutor}
          rows={tableData}
        />
      )}

      <SellAllTokensInterface
        open={isSellAllDialogOpen}
        onOpenChange={setIsSellAllDialogOpen}
        description="Swaps every outcome token you hold in this contest back to sUSDS."
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
        onRedeem={handleRedeem}
        isLoading={
          isLoading || isLoadingBalances || isLoadingParentBalances || isLoadingOtherBalances
        }
        hasRedeemable={hasRedeemable}
        payout={payout}
      />
    </>
  );
};
