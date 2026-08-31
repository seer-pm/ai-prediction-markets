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
import { DECIMALS, getSeerMarketUrl } from "@/utils/constants";
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
                  {/* The row's title doubles as the link to the market on Seer — the icon is what
                      says so, since the truncation already eats any trailing affordance. */}
                  <a
                    href={getSeerMarketUrl(market.marketId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/link inline-flex max-w-[220px] items-center gap-1.5 text-ink transition-colors hover:text-primary sm:max-w-sm"
                    title={
                      market.applicant ? `${market.project} — ${market.applicant}` : market.project
                    }
                  >
                    <span className="truncate">{market.project}</span>
                    <ExternalIcon
                      width={13}
                      height={13}
                      className="shrink-0 text-ink-4 transition-colors group-hover/link:text-primary"
                    />
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
