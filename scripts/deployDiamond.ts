import { ethers } from "hardhat";

async function main() {
	const [deployer] = await ethers.getSigners();
	console.log("Deploying with", deployer.address);

	const Core = await ethers.getContractFactory("CoreFacet");
	const Delegation = await ethers.getContractFactory("DelegationFacet");
	const Purchase = await ethers.getContractFactory("PurchaseFacet");
	const Reveal = await ethers.getContractFactory("RevealFacet");
	const Strategy = await ethers.getContractFactory("StrategyFacet");
	const Admin = await ethers.getContractFactory("AdminFacet");
	const Diamond = await ethers.getContractFactory("VotingDiamond");
	const WeightedStrategy = await ethers.getContractFactory("WeightedSplitStrategy");

	const [core, delegation, purchase, reveal, strategy, admin, weighted] = await Promise.all([
		Core.deploy(),
		Delegation.deploy(),
		Purchase.deploy(),
		Reveal.deploy(),
		Strategy.deploy(),
		Admin.deploy(),
		WeightedStrategy.deploy(),
	]);

	const selectorDefs = [
		{ sig: "createSession(string,string[],uint256[],uint256,uint256,uint256,uint8,bool,bool,bool,address[],uint256)", impl: core },
		{ sig: "castVote(uint256,(uint256,uint256)[],bool)", impl: core },
		{ sig: "castAnonymousVote(uint256,bytes32,(uint256,uint256)[],bool)", impl: core },
		{ sig: "confirmVote(uint256)", impl: core },
		{ sig: "revokeVote(uint256)", impl: core },
		{ sig: "updateVote(uint256,(uint256,uint256)[],bool)", impl: core },
		{ sig: "getOptionTotals(uint256)", impl: core },
		{ sig: "getWinners(uint256)", impl: core },
		{ sig: "getOptions(uint256)", impl: core },
		{ sig: "getVoteAllocations(uint256,address)", impl: core },
		{ sig: "canSeeResults(uint256,address)", impl: core },
		{ sig: "delegateVote(uint256,address)", impl: delegation },
		{ sig: "purchaseWeight(uint256)", impl: purchase },
		{ sig: "setAuthorizedViewer(uint256,address,bool)", impl: reveal },
		{ sig: "revealResults(uint256)", impl: reveal },
		{ sig: "emitSessionEnd(uint256)", impl: reveal },
		{ sig: "setStrategy(uint8,address)", impl: strategy },
		{ sig: "clearStrategy(uint8)", impl: strategy },
		{ sig: "owner()", impl: admin },
		{ sig: "transferOwnership(address)", impl: admin },
		{ sig: "setVoterWeight(uint256,address,uint256)", impl: admin },
		{ sig: "nextSessionId()", impl: admin },
	];

	const selectorBytes = selectorDefs.map((d) => ethers.dataSlice(ethers.id(d.sig), 0, 4));
	const implAddrs = await Promise.all(selectorDefs.map(async (d) => d.impl.getAddress()));
	const diamond = await Diamond.deploy(selectorBytes, implAddrs, deployer.address);
	console.log("Diamond deployed at", await diamond.getAddress());

	const hub = await ethers.getContractAt("VotingHubInterface", await diamond.getAddress());
	for (const alg of [0, 1, 2]) {
		await hub.setStrategy(alg, await weighted.getAddress());
	}

	console.log("Default strategies set to WeightedSplitStrategy");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
