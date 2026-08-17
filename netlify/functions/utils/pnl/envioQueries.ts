import type { SupportedChain } from "@seer-pm/sdk";
import { seerEnvioRequest } from "./envioClient";

/**
 * HyperIndex operations the published `@seer-pm/sdk` does not generate.
 *
 * Seer's workspace copy of the SDK (`D:\Code\demo\packages\seer-pm-sdk\queries\markets.graphql`)
 * has these; npm's 0.0.18 stops at `GetMarkets` / `GetConditionalEvents` / `GetTransfers`, and
 * its `Transfer` fragment omits `market` / `kind` / `involvesRouter`. Kept verbatim against the
 * same schema so a later SDK release can replace this file wholesale.
 */

const TRANSFERS = /* GraphQL */ `
  query GetTransfersWithMarket(
    $offset: Int = 0
    $limit: Int = 1000
    $where: Transfer_bool_exp
    $orderBy: [Transfer_order_by!]
  ) {
    Transfer(limit: $limit, offset: $offset, where: $where, order_by: $orderBy) {
      chainId
      from
      to
      timestamp
      blockNumber
      transactionHash
      transactionFrom
      logIndex
      value
      kind
      involvesRouter
      market {
        id
        address
      }
      token {
        id
      }
    }
  }
`;

const TOKEN_BALANCES = /* GraphQL */ `
  query GetTokenBalances($where: TokenBalance_bool_exp, $offset: Int = 0, $limit: Int = 1000, $orderBy: [TokenBalance_order_by!]) {
    TokenBalance(where: $where, offset: $offset, limit: $limit, order_by: $orderBy) {
      id
      chainId
      token
      account
      balance
      updatedAtBlock
      updatedAtTimestamp
      lastDailyDayStart
    }
  }
`;

const TOKEN_BALANCE_DAILIES = /* GraphQL */ `
  query GetTokenBalanceDailies(
    $where: TokenBalanceDaily_bool_exp
    $offset: Int = 0
    $limit: Int = 1000
    $orderBy: [TokenBalanceDaily_order_by!]
  ) {
    TokenBalanceDaily(where: $where, offset: $offset, limit: $limit, order_by: $orderBy) {
      id
      chainId
      account
      token
      dayStartTimestamp
      balance
    }
  }
`;

const ACCOUNT_ACTIVITY = /* GraphQL */ `
  query GetAccountActivity($id: String!) {
    accountActivity: AccountActivity_by_pk(id: $id) {
      id
      chainId
      account
      earliestTransferTimestamp
      lastTransferTimestamp
      transferCount
    }
  }
`;

export type EnvioTransferRow = {
  chainId: string;
  from: string;
  to: string;
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
  transactionFrom: string;
  logIndex: string;
  value: string;
  kind: string | null;
  involvesRouter: boolean | null;
  market: { id: string; address: string } | null;
  token: { id: string } | null;
};

export type EnvioTokenBalanceRow = { token: string; account: string; balance: string };

export type EnvioTokenBalanceDailyRow = {
  account: string;
  token: string;
  dayStartTimestamp: string;
  balance: string;
};

export type EnvioAccountActivityRow = {
  earliestTransferTimestamp: string;
  lastTransferTimestamp: string;
  transferCount: string;
};

export function getTransfers(chainId: SupportedChain, variables: Record<string, unknown>) {
  return seerEnvioRequest<{ Transfer: EnvioTransferRow[] }>(
    chainId,
    "GetTransfersWithMarket",
    TRANSFERS,
    variables,
  );
}

export function getTokenBalances(chainId: SupportedChain, variables: Record<string, unknown>) {
  return seerEnvioRequest<{ TokenBalance: EnvioTokenBalanceRow[] }>(
    chainId,
    "GetTokenBalances",
    TOKEN_BALANCES,
    variables,
  );
}

export function getTokenBalanceDailies(chainId: SupportedChain, variables: Record<string, unknown>) {
  return seerEnvioRequest<{ TokenBalanceDaily: EnvioTokenBalanceDailyRow[] }>(
    chainId,
    "GetTokenBalanceDailies",
    TOKEN_BALANCE_DAILIES,
    variables,
  );
}

export function getAccountActivity(chainId: SupportedChain, id: string) {
  return seerEnvioRequest<{ accountActivity: EnvioAccountActivityRow | null }>(
    chainId,
    "GetAccountActivity",
    ACCOUNT_ACTIVITY,
    { id },
  );
}
