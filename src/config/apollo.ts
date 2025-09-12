import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
import { UNISWAP_GRAPHQL_URL } from "../../codegen";

export const UniswapGraphQLClient = new ApolloClient({
  link: new HttpLink({ uri: UNISWAP_GRAPHQL_URL }),
  cache: new InMemoryCache(),
});