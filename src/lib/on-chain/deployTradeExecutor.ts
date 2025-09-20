import { CreateCallAbi } from "@/abis/CreateCallAbi";
import { Address, encodeAbiParameters, encodePacked, keccak256 } from "viem";
import { TradeExecutorBytecode } from "@/abis/TradeExecutorAbi";
import { config } from "@/config/wagmi";
import { formatBytecode } from "@/utils/common";
import { CHAIN_ID, CONDITIONAL_TOKENS, CREATE_FACTORIES } from "@/utils/constants";
import { getBytecode, writeContract } from "@wagmi/core";
import { toastifyTx } from "../toastify";

interface FactoryDeployParams {
  factoryAddress: Address;
  conditionalTokensAddress: Address;
  ownerAddress: Address;
  bytecode: string;
}

function generateSalt(ownerAddress: Address): Address {
  return keccak256(encodePacked(["string", "address"], ["TradeExecutor_v1", ownerAddress]));
}

function predictFactoryAddress({
  factoryAddress,
  salt,
  deploymentData,
}: {
  factoryAddress: Address;
  salt: Address;
  deploymentData: Address;
}): Address {
  const initCodeHash = keccak256(deploymentData);

  const create2Input = encodePacked(
    ["bytes1", "address", "bytes32", "bytes32"],
    ["0xff", factoryAddress, salt, initCodeHash]
  );

  const hash = keccak256(create2Input);
  return `0x${hash.slice(-40)}` as Address;
}

async function checkAndDeployWithFactory({
  factoryAddress,
  conditionalTokensAddress,
  ownerAddress,
  bytecode,
}: FactoryDeployParams) {
  // Format bytecode and prepare deployment data
  const formattedBytecode = bytecode.startsWith("0x")
    ? (bytecode as Address)
    : (`0x${bytecode}` as Address);

  const constructorData = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }],
    [conditionalTokensAddress, ownerAddress]
  );

  const deploymentData = `${formattedBytecode}${constructorData.slice(2)}` as Address;
  const salt = generateSalt(ownerAddress);

  // Predict contract address
  const predictedAddress = predictFactoryAddress({
    factoryAddress,
    salt,
    deploymentData,
  });

  // Check if already deployed
  const code = await getBytecode(config, {
    address: predictedAddress,
  });

  if (code && code !== "0x") {
    return predictedAddress;
  }

  const result = await toastifyTx(
    () =>
      writeContract(config, {
        address: factoryAddress,
        abi: CreateCallAbi,
        functionName: "performCreate2",
        args: [0n, deploymentData, salt],
      }),
    {
      txSent: { title: "Deploying Trade Executor..." },
      txSuccess: { title: "Trade Executor deployed!" },
    }
  );
  if(!result.status){
    throw result.error
  }

  return predictedAddress;
}

export async function initTradeExecutor(account: Address) {
  return await checkAndDeployWithFactory({
    factoryAddress: CREATE_FACTORIES[CHAIN_ID],
    conditionalTokensAddress: CONDITIONAL_TOKENS[CHAIN_ID],
    ownerAddress: account,
    bytecode: formatBytecode(TradeExecutorBytecode),
  });
}
