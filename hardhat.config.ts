import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

export default defineConfig({
	plugins: [hardhatToolboxMochaEthersPlugin],
	solidity: {
		profiles: {
			default: {
				version: "0.8.28",
				settings: {
					optimizer: { enabled: true, runs: 20000 },
					viaIR: true,
				},
			},
			production: {
				version: "0.8.28",
				settings: {
					optimizer: { enabled: true, runs: 20000 },
					viaIR: true,
				},
			},
		},
	},
	networks: {
		hardhatMainnet: {
			type: "edr-simulated",
			chainType: "l1",
			mining: {
				auto: true,
				interval: 12000,
			},
		},
		hardhatOp: {
			type: "edr-simulated",
			chainType: "op",
		},
		lan: {
			type: "http",
			chainType: "l1",
			url: "http://192.168.1.143:8545",
		},
		sepolia: {
			type: "http",
			chainType: "l1",
			url: configVariable("SEPOLIA_RPC_URL"),
			accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
		},
	},
});
