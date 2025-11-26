import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "hardhat";

const SIGS = [
	"createSession(string,string[],uint256[],uint256,uint256,uint256,uint8,bool,bool,bool,address[],uint256)",
	"castVote(uint256,(uint256,uint256)[],bool)",
	"castAnonymousVote(uint256,bytes32,(uint256,uint256)[],bool)",
	"confirmVote(uint256)",
	"revokeVote(uint256)",
	"updateVote(uint256,(uint256,uint256)[],bool)",
	"getOptionTotals(uint256)",
	"getWinners(uint256)",
	"getOptions(uint256)",
	"getVoteAllocations(uint256,address)",
	"canSeeResults(uint256,address)",
	"getSessionMeta(uint256)",
	"listSessions()",
	"delegateVote(uint256,address)",
	"purchaseWeight(uint256)",
	"setAuthorizedViewer(uint256,address,bool)",
	"revealResults(uint256)",
	"emitSessionEnd(uint256)",
	"setStrategy(uint8,address)",
	"clearStrategy(uint8)",
	"owner()",
	"transferOwnership(address)",
	"setVoterWeight(uint256,address,uint256)",
	"nextSessionId()",
];

const facetMap: Record<string, string> = {
	"createSession(string,string[],uint256[],uint256,uint256,uint256,uint8,bool,bool,bool,address[],uint256)": "CoreFacet",
	"castVote(uint256,(uint256,uint256)[],bool)": "CoreFacet",
	"castAnonymousVote(uint256,bytes32,(uint256,uint256)[],bool)": "CoreFacet",
	"confirmVote(uint256)": "CoreFacet",
	"revokeVote(uint256)": "CoreFacet",
	"updateVote(uint256,(uint256,uint256)[],bool)": "CoreFacet",
	"getOptionTotals(uint256)": "CoreFacet",
	"getWinners(uint256)": "CoreFacet",
	"getOptions(uint256)": "CoreFacet",
	"getVoteAllocations(uint256,address)": "CoreFacet",
	"canSeeResults(uint256,address)": "CoreFacet",
	"getSessionMeta(uint256)": "CoreFacet",
	"listSessions()": "CoreFacet",
	"delegateVote(uint256,address)": "DelegationFacet",
	"purchaseWeight(uint256)": "PurchaseFacet",
	"setAuthorizedViewer(uint256,address,bool)": "RevealFacet",
	"revealResults(uint256)": "RevealFacet",
	"emitSessionEnd(uint256)": "RevealFacet",
	"setStrategy(uint8,address)": "StrategyFacet",
	"clearStrategy(uint8)": "StrategyFacet",
	"owner()": "AdminFacet",
	"transferOwnership(address)": "AdminFacet",
	"setVoterWeight(uint256,address,uint256)": "AdminFacet",
	"nextSessionId()": "AdminFacet",
};

export default buildModule("VotingDiamondModule", (m) => {
	const deployedFacets: Record<string, any> = {};
	const diamondArgsSelectors: string[] = [];
	const diamondArgsImpls: any[] = [];

	for (const sig of SIGS) {
		const facetName = facetMap[sig];
		if (!deployedFacets[facetName]) {
			deployedFacets[facetName] = m.contract(facetName);
		}
		diamondArgsSelectors.push(ethers.dataSlice(ethers.id(sig), 0, 4));
		diamondArgsImpls.push(deployedFacets[facetName]);
	}

	const weighted = m.contract("WeightedSplitStrategy");
	const diamond = m.contract("VotingDiamond", [diamondArgsSelectors, diamondArgsImpls, m.getAccount(0)]);

	const strategyAtDiamond = m.contractAt("StrategyFacet", diamond);
	for (const alg of [0, 1, 2]) {
		m.call(strategyAtDiamond, "setStrategy", [alg, weighted]);
	}

	return { diamond, weighted };
});
