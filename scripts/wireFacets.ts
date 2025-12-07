import hre from "hardhat";
import fs from "fs";
import path from "path";
const __dirname = path.dirname(new URL(import.meta.url).pathname);

/**
 * Re-wire facet selectors on an already deployed diamond.
 *
 * Usage:
 *   DIAMOND=0x... npx hardhat run scripts/wireFacets.ts --network lan
 *
 * Reads facet addresses from ignition/deployments/chain-31337/deployed_addresses.json by default.
 */
async function main() {
	const diamondAddr =
		process.env.DIAMOND ||
		process.env.diamond ||
		process.argv.find((a) => a.startsWith("--diamond"))?.split("=")[1];
	if (!diamondAddr || diamondAddr.length !== 42) {
		throw new Error("Pass DIAMOND env or --diamond <address>");
	}

	const { ethers } = await hre.network.connect();
	const chainId = process.env.CHAIN_ID || "31337";
	const deployPath = path.join(
		__dirname,
		`../ignition/deployments/chain-${chainId}/deployed_addresses.json`,
	);
	if (!fs.existsSync(deployPath)) {
		throw new Error(`Deployment addresses not found at ${deployPath}`);
	}
	const addresses = JSON.parse(fs.readFileSync(deployPath, "utf8"));

	// Map function signatures to facet deployment key in deployed_addresses.json
	const sigToFacetKey: Record<string, string> = {
		// CoreFacet
		"createSession(string,string[],uint256[],uint256,uint256,uint256,uint8,bool,bool,bool,address[],uint256,uint256)": "VotingDiamondModule#CoreFacet",
		"castVote(uint256,(uint256,uint256)[],bool)": "VotingDiamondModule#CoreFacet",
		"castAnonymousVote(uint256,bytes32,(uint256,uint256)[],bool)": "VotingDiamondModule#CoreFacet",
		"confirmVote(uint256)": "VotingDiamondModule#CoreFacet",
		"revokeVote(uint256)": "VotingDiamondModule#CoreFacet",
		"updateVote(uint256,(uint256,uint256)[],bool)": "VotingDiamondModule#CoreFacet",
		"getOptionTotals(uint256)": "VotingDiamondModule#ViewFacet",
		"getWinners(uint256)": "VotingDiamondModule#ViewFacet",
		"getOptions(uint256)": "VotingDiamondModule#ViewFacet",
		"getVoteAllocations(uint256,address)": "VotingDiamondModule#ViewFacet",
		"canSeeResults(uint256,address)": "VotingDiamondModule#ViewFacet",
		"getVoterState(uint256,address)": "VotingDiamondModule#ViewFacet",
		"getSessionMeta(uint256)": "VotingDiamondModule#ViewFacet",
		"listSessions()": "VotingDiamondModule#ViewFacet",
		"listVoters(uint256)": "VotingDiamondModule#ViewFacet",
		"listDelegators(uint256,address)": "VotingDiamondModule#ViewFacet",
		// Delegation
		"delegateVote(uint256,address)": "VotingDiamondModule#DelegationFacet",
		// Purchase
		"purchaseWeight(uint256)": "VotingDiamondModule#PurchaseFacet",
		// Reveal
		"setAuthorizedViewer(uint256,address,bool)": "VotingDiamondModule#RevealFacet",
		"revealResults(uint256)": "VotingDiamondModule#RevealFacet",
		"emitSessionEnd(uint256)": "VotingDiamondModule#RevealFacet",
		"forceEndSession(uint256)": "VotingDiamondModule#RevealFacet",
		// Strategy registry
		"setStrategy(uint8,address)": "VotingDiamondModule#StrategyFacet",
		"clearStrategy(uint8)": "VotingDiamondModule#StrategyFacet",
		// Admin
		"owner()": "VotingDiamondModule#AdminFacet",
		"transferOwnership(address)": "VotingDiamondModule#AdminFacet",
		"setVoterWeight(uint256,address,uint256)": "VotingDiamondModule#AdminFacet",
		"nextSessionId()": "VotingDiamondModule#AdminFacet",
	};

	const iface = new ethers.Interface(["function setFacet(bytes4,address)", "function facets(bytes4) view returns (address)"]);
	const diamond = new ethers.Contract(diamondAddr, iface, (await ethers.getSigners())[0]);

	for (const [sig, facetKey] of Object.entries(sigToFacetKey)) {
		const impl = addresses[facetKey];
		if (!impl) {
			console.warn(`Missing address for ${facetKey}, skipping ${sig}`);
			continue;
		}
		const selector = ethers.id(sig).slice(0, 10);
		const current: string = await diamond.facets(selector);
		if (current.toLowerCase() === impl.toLowerCase()) {
			console.log(`${sig} already set -> ${impl}`);
			continue;
		}
		const tx = await diamond.setFacet(selector, impl);
		await tx.wait();
		console.log(`setFacet(${sig}) -> ${impl}`);
	}

	console.log("Done wiring facets.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
