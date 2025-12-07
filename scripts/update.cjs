const fs = require("fs");
const path = require("path");

// --- Configuration ---
const CHAIN_ID = "31337"; // Hardhat Network default
const DEPLOYMENT_PATH = path.join(__dirname, `../ignition/deployments/chain-${CHAIN_ID}/deployed_addresses.json`);
const FRONTEND_FILE = path.join(__dirname, "../frontend/static/contract-address.json");

function main() {
	if (!fs.existsSync(DEPLOYMENT_PATH)) {
		console.error(`❌ Deployment file not found: ${DEPLOYMENT_PATH}`);
		console.error("   Did you run 'npx hardhat ignition deploy ...'?");
		process.exit(1);
	}

	console.log("Reading deployment addresses...");
	const addresses = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));

	// Ignition format: "Module#Contract"
	const diamondAddress = addresses["VotingDiamondModule#VotingDiamond"];

	if (!diamondAddress) {
		console.error("❌ 'VotingDiamondModule#VotingDiamond' not found in deployment.");
		process.exit(1);
	}

	// Read current frontend config to preserve the rpcUrl
	let currentConfig = { rpcUrl: "http://127.0.0.1:8545" }; // default
	if (fs.existsSync(FRONTEND_FILE)) {
		try {
			currentConfig = JSON.parse(fs.readFileSync(FRONTEND_FILE, "utf8"));
		} catch (e) {
			console.warn("Could not parse existing frontend config, creating new one.");
		}
	}

	const newConfig = {
		...currentConfig,
		address: diamondAddress
	};

	fs.writeFileSync(FRONTEND_FILE, JSON.stringify(newConfig, null, 2));

	console.log(`✅ Updated ${FRONTEND_FILE}`);
	console.log(`   Address: ${diamondAddress}`);
}

main();