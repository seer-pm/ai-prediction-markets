import { getToken0Token1 } from "@/utils/common";
import {
  CHAIN_ID,
  L1_MARKET_ID,
  L2_PARENT_MARKET_ID,
  ORIGINALITY_PARENT_MARKET_ID,
  OTHER_MARKET_ID,
} from "@/utils/constants";
import { createClient } from "@supabase/supabase-js";
import { Address, zeroAddress } from "viem";
import fs from "fs";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);
function pairKey(token: Address, collateral: Address) {
  const { token0, token1 } = getToken0Token1(token, collateral);
  return `${token0.toLowerCase()}_${token1.toLowerCase()}`;
}

const getL1MarketsQuestions = async () => {
  const { data, error } = await supabase
    .from("markets")
    .select(
      "subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->payoutNumerators,subgraph_data->questions,subgraph_data->collateralToken,subgraph_data->templateId",
    )
    .eq("id", L1_MARKET_ID)
    .eq("chain_id", CHAIN_ID)
    .single();
  if (error) {
    throw error;
  }
  if (!data) {
    throw { message: "Market not found" };
  }
  const { data: otherMarketData, error: otherMarketError } = await supabase
    .from("markets")
    .select(
      "id,subgraph_data->wrappedTokens,subgraph_data->blockTimestamp,subgraph_data->outcomes,subgraph_data->payoutNumerators,subgraph_data->questions,subgraph_data->collateralToken,subgraph_data->templateId",
    )
    .eq("subgraph_data->parentMarket->>id", L1_MARKET_ID)
    .eq("chain_id", CHAIN_ID)
    .single();
  if (otherMarketError) {
    throw otherMarketError;
  }
  if (!otherMarketData) {
    throw { message: "Other market not found" };
  }
  return [
    {
      marketId: L1_MARKET_ID,
      collateralToken: data.collateralToken,
      templateId: data.templateId as string,
      questions: (data.questions as any[]).map((question, i) => {
        return {
          ...question.question,
          id: question.question.id as `0x${string}`,
          opening_ts: Number(question.question.opening_ts),
          timeout: Number(question.question.timeout),
          finalize_ts: Number(question.question.finalize_ts),
          bond: question.question.bond,
          min_bond: question.question.min_bond,
          base_question: (question?.baseQuestion?.id || zeroAddress) as `0x${string}`,
          repo: (data.outcomes as string[])[i],
        };
      }),
    },
    {
      marketId: OTHER_MARKET_ID,
      collateralToken: otherMarketData.collateralToken,
      templateId: otherMarketData.templateId as string,
      questions: (otherMarketData.questions as any[]).map((question, i) => {
        return {
          ...question.question,
          id: question.question.id as `0x${string}`,
          opening_ts: Number(question.question.opening_ts),
          timeout: Number(question.question.timeout),
          finalize_ts: Number(question.question.finalize_ts),
          bond: question.question.bond,
          min_bond: question.question.min_bond,
          base_question: (question?.baseQuestion?.id || zeroAddress) as `0x${string}`,
          repo: (otherMarketData.outcomes as string[])[i],
        };
      }),
    },
  ];
};

const getOriginalityMarketsQuestions = async () => {
  const { data: parentMarket, error: parentMarketError } = await supabase
    .from("markets")
    .select(
      "id,subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->collateralToken,subgraph_data->parentOutcome,subgraph_data->blockTimestamp,subgraph_data->questions,subgraph_data->templateId",
    )
    .eq("id", ORIGINALITY_PARENT_MARKET_ID)
    .eq("chain_id", CHAIN_ID)
    .single();
  if (parentMarketError) {
    throw parentMarketError;
  }
  if (!parentMarket) {
    throw new Error("Parent market not found");
  }
  let { data, error } = await supabase
    .from("markets")
    .select(
      "id,subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->collateralToken,subgraph_data->parentOutcome,subgraph_data->blockTimestamp,subgraph_data->questions,subgraph_data->templateId",
    )
    .eq("subgraph_data->parentMarket->>id", ORIGINALITY_PARENT_MARKET_ID)
    .eq("chain_id", CHAIN_ID);
  if (!data) {
    throw new Error("Markets not found");
  }
  if (error) {
    throw error;
  }
  const markets = data as {
    wrappedTokens: Address[];
    collateralToken: Address;
    id: Address;
    outcomes: string[];
    parentOutcome: number;
    blockTimestamp: string;
    questions: any[];
    templateId: string;
  }[];
  return [
    {
      marketId: ORIGINALITY_PARENT_MARKET_ID,
      collateralToken: parentMarket.collateralToken,
      templateId: parentMarket.templateId as string,
      questions: (parentMarket.questions as any[]).map((question, i) => {
        return {
          ...question.question,
          id: question.question.id as `0x${string}`,
          opening_ts: Number(question.question.opening_ts),
          timeout: Number(question.question.timeout),
          finalize_ts: Number(question.question.finalize_ts),
          bond: question.question.bond,
          min_bond: question.question.min_bond,
          base_question: (question?.baseQuestion?.id || zeroAddress) as `0x${string}`,
        };
      }),
    },
    ...markets.map((market) => {
      return {
        marketId: market.id,
        collateralToken: market.collateralToken,
        templateId: market.templateId,
        questions: market.questions.map((question, i) => {
          return {
            ...question.question,
            id: question.question.id as `0x${string}`,
            opening_ts: Number(question.question.opening_ts),
            timeout: Number(question.question.timeout),
            finalize_ts: Number(question.question.finalize_ts),
            bond: question.question.bond,
            min_bond: question.question.min_bond,
            base_question: (question?.baseQuestion?.id || zeroAddress) as `0x${string}`,
            repo: (parentMarket.outcomes as string[])[market.parentOutcome],
          };
        }),
      };
    }),
  ];
};

const getL2MarketsQuestions = async () => {
  const { data: parentMarket, error: parentMarketError } = await supabase
    .from("markets")
    .select(
      "id,subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->collateralToken,subgraph_data->parentOutcome,subgraph_data->blockTimestamp,subgraph_data->questions,subgraph_data->templateId",
    )
    .eq("id", L2_PARENT_MARKET_ID)
    .eq("chain_id", CHAIN_ID)
    .single();
  if (parentMarketError) {
    throw parentMarketError;
  }
  if (!parentMarket) {
    throw new Error("Parent market not found");
  }
  let { data, error } = await supabase
    .from("markets")
    .select(
      "id,subgraph_data->wrappedTokens,subgraph_data->outcomes,subgraph_data->collateralToken,subgraph_data->parentOutcome,subgraph_data->blockTimestamp,subgraph_data->questions,subgraph_data->templateId",
    )
    .eq("subgraph_data->parentMarket->>id", L2_PARENT_MARKET_ID)
    .ilike("subgraph_data->>marketName", "%What will be the average weight of%")
    .eq("chain_id", CHAIN_ID);
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Markets not found");
  }

  const markets = data as {
    wrappedTokens: Address[];
    collateralToken: Address;
    id: Address;
    outcomes: string[];
    parentOutcome: number;
    blockTimestamp: string;
    questions: any[];
    templateId: string;
  }[];
  return [
    {
      marketId: L2_PARENT_MARKET_ID,
      collateralToken: parentMarket.collateralToken,
      templateId: parentMarket.templateId as string,
      questions: (parentMarket.questions as any[]).map((question, i) => {
        return {
          ...question.question,
          id: question.question.id as `0x${string}`,
          opening_ts: Number(question.question.opening_ts),
          timeout: Number(question.question.timeout),
          finalize_ts: Number(question.question.finalize_ts),
          bond: question.question.bond,
          min_bond: question.question.min_bond,
          base_question: (question?.baseQuestion?.id || zeroAddress) as `0x${string}`,
        };
      }),
    },
    ...markets.map((market) => {
      return {
        marketId: market.id,
        collateralToken: market.collateralToken,
        templateId: market.templateId,
        questions: market.questions.map((question, i) => {
          return {
            ...question.question,
            id: question.question.id as `0x${string}`,
            opening_ts: Number(question.question.opening_ts),
            timeout: Number(question.question.timeout),
            finalize_ts: Number(question.question.finalize_ts),
            bond: question.question.bond,
            min_bond: question.question.min_bond,
            base_question: (question?.baseQuestion?.id || zeroAddress) as `0x${string}`,
            repo: (parentMarket.outcomes as string[])[market.parentOutcome],
            dependency: market.outcomes[i],
          };
        }),
      };
    }),
  ];
};

export default async () => {
  const l1Markets = await getL1MarketsQuestions();
  const orgMarkets = await getOriginalityMarketsQuestions();
  const l2Markets = await getL2MarketsQuestions();
  const data = l1Markets.concat(orgMarkets).concat(l2Markets);
  console.log(data);
};
