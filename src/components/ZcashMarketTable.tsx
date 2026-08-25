import { ExportWeightsButton } from "@/components/contest/ExportWeightsButton";
import {
  Badge,
  Card,
  CardHeader,
  OutcomeBar,
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
import { ZcashTableData } from "@/types";
import { DECIMALS } from "@/utils/constants";
import { formatTokenAmount } from "@/utils/format";
import { ZCASH_FORUM_URL } from "@/utils/zcashMarkets";
import React, { type ReactNode } from "react";

interface MarketTableProps {
  markets: ZcashTableData[];
  isLoading: boolean;
  isLoadingBalances: boolean;
  emptyState?: ReactNode;
  onExport?: () => void;
  exportDisabled?: boolean;
}

/** What the user predicted for a proposal. Three states: approved, rejected, and no view. */
const PredictionCell: React.FC<{ approved: boolean | null }> = ({ approved }) => {
  if (approved === null) {
    return <span className="text-ink-4">—</span>;
  }
  return <Badge tone={approved ? "long" : "short"}>{approved ? "Approved" : "Rejected"}</Badge>;
};

const ZcashMarketTableInner: React.FC<MarketTableProps> = ({
  markets,
  isLoading,
  isLoadingBalances,
  emptyState,
  onExport,
  exportDisabled,
}) => (
  <Card flush>
    <CardHeader
      eyebrow="Zcash · Q3 2026"
      title="Approve or reject"
      description={
        <>
          One row per proposal on the Q3 grants ballot.{" "}
          <a
            href={ZCASH_FORUM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-primary transition-colors hover:text-primary-hover"
          >
            Review thread
            <ExternalIcon width={13} height={13} />
          </a>
        </>
      }
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
      <TableSkeleton columns={5} />
    ) : markets.length === 0 ? (
      emptyState
    ) : (
      <TableScroller>
        <Table minWidth={760}>
          <Thead>
            <Th pinned>Proposal</Th>
            <Th title="What the market pays for yes and for no, out of one.">Market</Th>
            <Th numeric>Yes balance</Th>
            <Th numeric>No balance</Th>
            <Th>Predicted approval</Th>
          </Thead>
          <Tbody>
            {markets.map((market) => (
              <Tr key={market.marketId}>
                <Td pinned>
                  <span
                    className="block max-w-[220px] truncate sm:max-w-sm"
                    title={
                      market.applicant ? `${market.project} — ${market.applicant}` : market.project
                    }
                  >
                    {market.project}
                  </span>
                  <a
                    href={`https://app.seer.pm/markets/10/${market.marketId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-label font-semibold text-primary transition-colors hover:text-primary-hover"
                  >
                    Open Seer
                    <ExternalIcon width={12} height={12} />
                  </a>
                </Td>
                <Td>
                  <OutcomeBar yes={market.yesPrice} no={market.noPrice} />
                </Td>
                <Td numeric>
                  {isLoadingBalances ? (
                    <Skeleton className="ml-auto" width={44} height={9} />
                  ) : (
                    formatTokenAmount(
                      typeof market.yesBalance === "bigint" ? market.yesBalance : undefined,
                      DECIMALS,
                    )
                  )}
                </Td>
                <Td numeric>
                  {isLoadingBalances ? (
                    <Skeleton className="ml-auto" width={44} height={9} />
                  ) : (
                    formatTokenAmount(
                      typeof market.noBalance === "bigint" ? market.noBalance : undefined,
                      DECIMALS,
                    )
                  )}
                </Td>
                <Td>
                  <PredictionCell approved={market.predictedApproved} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableScroller>
    )}
  </Card>
);

export const ZcashMarketTable = React.memo(ZcashMarketTableInner);
