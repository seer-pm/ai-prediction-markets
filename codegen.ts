import { CodegenConfig } from "@graphql-codegen/cli";

export const UNISWAP_GRAPHQL_URL =
  "https://gateway.thegraph.com/api/8b2690ffdd390bad59638b894ee8d9f6/subgraphs/id/5Vg1mtJELha5ApuhkBk573K1iQKh6uUie72VotwGURy4";

const config: CodegenConfig = {
  overwrite: true,
  schema: UNISWAP_GRAPHQL_URL,
  documents: "src/queries",
  generates: {
    "src/gql/": {
      preset: "client",
      plugins: [],
    },
  },
};

export default config;
