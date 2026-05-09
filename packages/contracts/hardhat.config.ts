import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import path from "node:path";
import { HardhatUserConfig } from "hardhat/config";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const rpcUrl = process.env.RPC_URL ?? process.env.ZERO_G_EVM_RPC;
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.CONTRACT_OWNER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    ...(rpcUrl
      ? {
          testnet: {
            url: rpcUrl,
            accounts: deployerPrivateKey ? [deployerPrivateKey] : []
          }
        }
      : {})
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test"
  }
};

export default config;
