import { ExportWeightsButton } from "@/components/contest/ExportWeightsButton";
import {
  Badge,
  Card,
  CardHeader,
  DeltaCell,
  Skeleton,
  Table,
  TableScroller,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@/components/ui";
import { ExternalIcon } from "@/components/ui/icons";
import type { ZcashNu7TableData } from "@/types";
import { DECIMALS, getSeerMarketUrl } from "@/utils/constants";
import {
  formatSignedWeight,
  formatTokenAmount,
  formatWeight,
  maxAbs,
  preciseValue,
} from "@/utils/format";
import { MarketStatus } from "@seer-pm/sdk";
import React, { useMemo, type ReactNode } from "react";

interface ZcashNu7MarketTableProps {
  markets: ZcashNu7TableData[];
  isLoading: boolean;
  isLoadingBalances: boolean;
  emptyState?: ReactNode;
  onExport?: () => void;
  exportDisabled?: boolean;
}

const COLUMN_COUNT = 6;

/**
 * The NU7 ballot as one table: a band per question, then a row per substantive outcome.
 *
 * Every other contest lists one row per *market*, because each of their markets is a single number.
 * This one is five markets of three to four competing outcomes, so a flat list would either lose the
 * grouping or repeat the question on every row. The two-level shape keeps one scan down the
 * Difference column across the whole ballot while still saying which question each outcome belongs
 * to — grouped with a `tbody` per question, which is what that element is for.
 *
 * Read-only. Trading is the predictions file plus one "Start trading" run, so a row has nothing to
 * click; the number you imported sits in the Predicted column.
 */
const ZcashNu7MarketTableInner: React.FC<ZcashNu7MarketTableProps> = ({
  markets,
  isLoading,
  isLoadingBalances,
  emptyState,
  onExport,
  exportDisabled,
}) => {
  // One scale across the whole ballot, not per question, so two bars of equal length mean an equal
  // edge whether they sit under Q1 or Q5.
  const scale = useMemo(
    () => maxAbs(markets.flatMap((market) => market.outcomes.map((leg) => leg.difference))),
    [markets],
  );

  return (
    <Card flush>
      <CardHeader
        eyebrow="Zcash · NU7"
        title="Predicted outcome prices"
        description="One row per outcome, grouped by ballot question. Your number sits beside the market's, and the difference is what a run would trade."
        actions={
          onExport && (
            <ExportWeightsButton
              onClick={onExport}
              disabled={exportDisabled}
              label="Export market view"
            />
          )
        }
      />

      {isLoading ? (
        <TableSkeleton columns={COLUMN_COUNT} />
      ) : markets.length === 0 ? (
        emptyState
      ) : (
        <TableScroller>
          <Table minWidth={860}>
            <Thead>
              {/* The outcome number the CSV keys on. Outcome labels live on chain and appear in no
                  static file, so this column and the market-view export are the only two places the
                  numbering is ever visible. */}
              <Th className="w-10" title="The outcome number to use in the predictions CSV.">
                #
              </Th>
              <Th>Outcome</Th>
              <Th numeric>Balance</Th>
              <Th numeric title="What the market pays for this outcome right now.">
                Market
              </Th>
              <Th numeric>Predicted</Th>
              <Th numeric>Difference</Th>
            </Thead>

            {markets.map((market) => (
              <Tbody key={market.marketId}>
                {/* The question band. Not a `Tr` — it is a heading rather than a data row, so it
                    takes neither the hover nor the row rule. */}
                <tr className="bg-sunken">
                  <td colSpan={COLUMN_COUNT} className="border-y border-rule px-3 py-3 sm:px-6">
                    <span className="mr-2 text-label font-semibold tracking-wider text-ink-3 uppercase">
                      {market.shortName}
                    </span>
                    {/* The question doubles as the link out to Seer — the icon is what says so. */}
                    <a
                      href={getSeerMarketUrl(market.marketId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group/link inline-flex items-baseline gap-1.5 text-body font-semibold whitespace-normal text-ink transition-colors hover:text-primary"
                    >
                      <span>{market.marketName}</span>
                      <ExternalIcon
                        width={13}
                        height={13}
                        className="shrink-0 self-center text-ink-4 transition-colors group-hover/link:text-primary"
                      />
                    </a>
                    {market.marketStatus === MarketStatus.CLOSED && (
                      <Badge tone="neutral" className="ml-2">
                        Settled
                      </Badge>
                    )}
                  </td>
                </tr>

                {market.outcomes.map((leg) => (
                  <Tr key={leg.token}>
                    <Td className="font-mono text-ink-4">{leg.outcomeNumber}</Td>
                    <Td className="whitespace-normal text-ink">{leg.outcome}</Td>
                    <Td numeric>
                      {isLoadingBalances && leg.balance === undefined ? (
                        <Skeleton className="ml-auto" width={44} height={9} />
                      ) : (
                        formatTokenAmount(leg.balance, DECIMALS)
                      )}
                    </Td>
                    <Td numeric title={preciseValue(leg.price)}>
                      {formatWeight(leg.price)}
                    </Td>
                    <Td numeric className="text-ink" title={preciseValue(leg.target)}>
                      {formatWeight(leg.target)}
                    </Td>
                    <Td className="text-right">
                      <DeltaCell
                        value={leg.difference}
                        max={scale}
                        format={formatSignedWeight}
                        title={preciseValue(leg.difference)}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            ))}
          </Table>
        </TableScroller>
      )}
    </Card>
  );
};

export const ZcashNu7MarketTable = React.memo(ZcashNu7MarketTableInner);
