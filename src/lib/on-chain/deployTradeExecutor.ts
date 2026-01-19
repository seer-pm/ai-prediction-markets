import { CreateCallAbi } from "@/abis/CreateCallAbi";
import { OldTradeExecutorBytecode, TradeExecutorBytecode } from "@/abis/TradeExecutorAbi";
import { config } from "@/config/wagmi";
import { formatBytecode } from "@/utils/common";
import { CHAIN_ID, CREATE_FACTORIES, SALT_KEY } from "@/utils/constants";
import { getBytecode, writeContract } from "@wagmi/core";
import { Address, encodeAbiParameters, encodePacked, Hex, keccak256 } from "viem";
import { toastifyTx } from "../toastify";

interface FactoryDeployParams {
  factoryAddress: Address;
  ownerAddress: Address;
  bytecode: Hex;
  constructorData: Hex;
}

function generateSalt(ownerAddress: Address): Hex {
  return keccak256(encodePacked(["string", "address"], [SALT_KEY, ownerAddress]));
}

function predictFactoryAddress({
  factoryAddress,
  salt,
  deploymentData,
}: {
  factoryAddress: Address;
  salt: Address;
  deploymentData: Hex;
}): Address {
  const initCodeHash = keccak256(deploymentData);

  const create2Input = encodePacked(
    ["bytes1", "address", "bytes32", "bytes32"],
    ["0xff", factoryAddress, salt, initCodeHash]
  );

  const hash = keccak256(create2Input);
  return `0x${hash.slice(-40)}` as Address;
}

async function checkContractCreated({
  factoryAddress,
  ownerAddress,
  bytecode,
  constructorData,
}: Omit<FactoryDeployParams, "supports7702">) {
  const deploymentData = `${bytecode}${constructorData.slice(2)}` as Hex;
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
    return { isCreated: true, predictedAddress };
  }
  return { isCreated: false };
}

async function checkAndDeployWithFactory({
  factoryAddress,
  ownerAddress,
  bytecode,
  constructorData,
}: FactoryDeployParams) {
  const deploymentData = `${bytecode}${constructorData.slice(2)}` as Hex;
  const salt = generateSalt(ownerAddress);

  // Predict contract address
  const predictedAddress = predictFactoryAddress({
    factoryAddress,
    salt,
    deploymentData,
  });

  // Check if already deployed
  const { isCreated } = await checkContractCreated({
    factoryAddress,
    ownerAddress,
    bytecode,
    constructorData,
  });

  if (isCreated) {
    return { predictedAddress };
  }

  const result = await toastifyTx(
    () =>
      writeContract(config, {
        address: factoryAddress,
        abi: CreateCallAbi,
        functionName: "performCreate2",
        args: [0n, deploymentData, salt],
        chainId: CHAIN_ID,
      }),
    {
      txSent: { title: "Deploying Trade Executor..." },
      txSuccess: { title: "Trade Executor deployed!" },
    }
  );
  if (!result.status) {
    throw result.error;
  }

  return { predictedAddress };
}

export async function initTradeExecutor(account: Address) {
  const constructorData = encodeAbiParameters([{ type: "address" }], [account]);
  return await checkAndDeployWithFactory({
    factoryAddress: CREATE_FACTORIES[CHAIN_ID],
    ownerAddress: account,
    bytecode: formatBytecode(TradeExecutorBytecode),
    constructorData,
  });
}

export async function checkTradeExecutorCreated(account: Address) {
  const constructorData = encodeAbiParameters([{ type: "address" }], [account]);
  return await checkContractCreated({
    factoryAddress: CREATE_FACTORIES[CHAIN_ID],
    ownerAddress: account,
    bytecode: formatBytecode(TradeExecutorBytecode),
    constructorData,
  });
}

export async function checkOldTradeExecutorCreated(account: Address) {
  const constructorData = encodeAbiParameters([{ type: "address" }], [account]);
  return await checkContractCreated({
    factoryAddress: CREATE_FACTORIES[CHAIN_ID],
    ownerAddress: account,
    bytecode: formatBytecode(OldTradeExecutorBytecode),
    constructorData,
  });
}
