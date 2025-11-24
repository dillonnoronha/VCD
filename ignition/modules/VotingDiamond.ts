import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const selectors = [
	"0x45c69d02", // createSession
	"0x26746ed6", // castVote
	"0xbfe9e64d", // castAnonymousVote
	"0xaa457faf", // confirmVote
	"0xf73a8b4a", // revokeVote
	"0x9503904c", // updateVote
	"0x642f123f", // getOptionTotals
	"0x6b1426a4", // getWinners
	"0x8915b3fb", // getOptions
	"0xde3cc9c5", // getVoteAllocations
	"0x8e1a7ec8", // canSeeResults
	"0xac71fe18", // delegateVote
	"0x05c24816", // purchaseWeight
	"0xee0c3a52", // setAuthorizedViewer
	"0xb8f6255a", // revealResults
	"0xf386461f", // emitSessionEnd
	"0x25cd5dd8", // setStrategy
	"0x516a98a6", // clearStrategy
	"0x8da5cb5b", // owner
	"0xf2fde38b", // transferOwnership
	"0xef4957d1", // setVoterWeight
	"0x49bbf7da", // nextSessionId
];

export default buildModule("VotingDiamondModule", (m) => {
	const core = m.contract("CoreFacet");
	const delegation = m.contract("DelegationFacet");
	const purchase = m.contract("PurchaseFacet");
	const reveal = m.contract("RevealFacet");
	const strategyFacet = m.contract("StrategyFacet");
	const admin = m.contract("AdminFacet");
	const weighted = m.contract("WeightedSplitStrategy");

	const impls = [
		core,
		core,
		core,
		core,
		core,
		core,
		core,
		core,
		core,
		core,
		core,
		delegation,
		purchase,
		reveal,
		reveal,
		reveal,
		strategyFacet,
		strategyFacet,
		admin,
		admin,
		admin,
		admin,
	];

	const diamond = m.contract("VotingDiamond", [selectors, impls, m.getAccount(0)]);

	const strategyAtDiamond = m.contractAt("StrategyFacet", diamond);
	for (const alg of [0, 1, 2]) {
		m.call(strategyAtDiamond, "setStrategy", [alg, weighted]);
	}

	return { diamond, weighted };
});
