import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

// Helper to find all Facet artifacts dynamically
const getFacetArtifacts = () => {
	// FIX: Use process.cwd() to point to the project root, avoiding __dirname issues
	const facetsDir = path.join(process.cwd(), "artifacts/contracts/diamond/facets");

	if (!fs.existsSync(facetsDir)) {
		throw new Error(`Artifacts not found at ${facetsDir}. Run 'npx hardhat compile' first.`);
	}

	const artifacts: { name: string; abi: any[] }[] = [];
	const entries = fs.readdirSync(facetsDir);

	for (const entry of entries) {
		if (entry.endsWith(".sol")) {
			const facetName = entry.replace(".sol", "");
			const artifactPath = path.join(facetsDir, entry, `${facetName}.json`);

			if (fs.existsSync(artifactPath)) {
				const json = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
				artifacts.push({ name: facetName, abi: json.abi });
			}
		}
	}

	return artifacts;
};

export default buildModule("VotingDiamondModule", (m) => {
	const owner = m.getParameter("owner", m.getAccount(0));

	// 1. Dynamically load all Facet artifacts
	const facetArtifacts = getFacetArtifacts();
	
	// Sort them to ensure deterministic deployment order
	facetArtifacts.sort((a, b) => a.name.localeCompare(b.name));

	const diamondArgsSelectors: string[] = [];
	const diamondArgsImpls: any[] = [];
	const deployedFacets: Record<string, any> = {};
	
	const seenSelectors = new Set<string>();

	// 2. Deploy Facets and calculate Selectors
	for (const { name, abi } of facetArtifacts) {
		const facetContract = m.contract(name);
		deployedFacets[name] = facetContract;

		const iface = new ethers.Interface(abi);
		
		iface.forEachFunction((func) => {
			if (!seenSelectors.has(func.selector)) {
				seenSelectors.add(func.selector);
				diamondArgsSelectors.push(func.selector);
				diamondArgsImpls.push(facetContract);
			}
		});
	}

	// 3. Deploy Strategies
	const onePerson = m.contract("OnePersonOneVoteStrategy");
	const weighted = m.contract("WeightedSplitStrategy");

	// 4. Deploy Diamond
	const diamond = m.contract("VotingDiamond", [
		diamondArgsSelectors,
		diamondArgsImpls,
		owner
	]);

	// 5. Initialize Strategies
	const strategyAtDiamond = m.contractAt("StrategyFacet", diamond, { id: "StrategyFacetAtDiamond" });
	m.call(strategyAtDiamond, "setStrategy", [0, onePerson], { id: "SetStrategy_v4_0" });
	m.call(strategyAtDiamond, "setStrategy", [1, weighted], { id: "SetStrategy_v4_1" });

	return { diamond, onePerson, weighted };
});

// import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
// import { ethers } from "ethers";

// 	const SIGS = [
// 		"createSession(string,string[],uint256[],uint256,uint256,uint256,uint8,bool,bool,bool,address[],uint256,uint256)",
// 		"castVote(uint256,(uint256,uint256)[],bool)",
// 		"castAnonymousVote(uint256,bytes32,(uint256,uint256)[],bool)",
// 		"confirmVote(uint256)",
// 		"revokeVote(uint256)",
// 		"updateVote(uint256,(uint256,uint256)[],bool)",
// 		"getOptionTotals(uint256)",
// 		"getWinners(uint256)",
// 		"getOptions(uint256)",
// 		"getVoteAllocations(uint256,address)",
// 		"listVoters(uint256)",
// 		"getVoterState(uint256,address)",
// 		"canSeeResults(uint256,address)",
// 		"getSessionMeta(uint256)",
// 		"listSessions()",
// 		"listDelegators(uint256,address)",
// 		"delegateVote(uint256,address)",
// 		"purchaseWeight(uint256)",
// 		"setAuthorizedViewer(uint256,address,bool)",
// 		"revealResults(uint256)",
// 		"emitSessionEnd(uint256)",
// 		"forceEndSession(uint256)",
// 		"setStrategy(uint8,address)",
// 		"clearStrategy(uint8)",
// 		"transferOwnership(address)",
// 		"setVoterWeight(uint256,address,uint256)",
// 		"nextSessionId()",
// 		"supportsInterface(bytes4)",
// 	];

// 	const facetMap: Record<string, string> = {
// 		"createSession(string,string[],uint256[],uint256,uint256,uint256,uint8,bool,bool,bool,address[],uint256,uint256)": "CoreFacet",
// 		"castVote(uint256,(uint256,uint256)[],bool)": "CoreFacet",
// 		"castAnonymousVote(uint256,bytes32,(uint256,uint256)[],bool)": "CoreFacet",
// 		"confirmVote(uint256)": "CoreFacet",
// 		"revokeVote(uint256)": "CoreFacet",
// 		"updateVote(uint256,(uint256,uint256)[],bool)": "CoreFacet",
// 		"getOptionTotals(uint256)": "ViewFacet",
// 		"getWinners(uint256)": "ViewFacet",
// 		"getOptions(uint256)": "ViewFacet",
// 		"getVoteAllocations(uint256,address)": "ViewFacet",
// 		"getVoterState(uint256,address)": "ViewFacet",
// 		"canSeeResults(uint256,address)": "ViewFacet",
// 		"getSessionMeta(uint256)": "ViewFacet",
// 		"listSessions()": "ViewFacet",
// 		"listDelegators(uint256,address)": "ViewFacet",
// 		"listVoters(uint256)": "ViewFacet",
// 		"delegateVote(uint256,address)": "DelegationFacet",
// 		"purchaseWeight(uint256)": "PurchaseFacet",
// 		"setAuthorizedViewer(uint256,address,bool)": "RevealFacet",
// 		"revealResults(uint256)": "RevealFacet",
// 		"emitSessionEnd(uint256)": "RevealFacet",
// 		"forceEndSession(uint256)": "RevealFacet",
// 		"setStrategy(uint8,address)": "StrategyFacet",
// 		"clearStrategy(uint8)": "StrategyFacet",
// 		"supportsInterface(bytes4)": "IntrospectionFacet",
// 		"transferOwnership(address)": "AdminFacet",
// 		"setVoterWeight(uint256,address,uint256)": "AdminFacet",
// 		"nextSessionId()": "AdminFacet",
// 	};

// export default buildModule("VotingDiamondModule", (m) => {
// 	const deployedFacets: Record<string, any> = {};
// 	const diamondArgsSelectors: string[] = [];
// 	const diamondArgsImpls: any[] = [];
// 	const owner = m.getParameter("owner", m.getAccount(0));

// 	for (const sig of SIGS) {
// 		const facetName = facetMap[sig];
// 		if (!deployedFacets[facetName]) {
// 			deployedFacets[facetName] = m.contract(facetName);
// 		}
// 		diamondArgsSelectors.push(ethers.dataSlice(ethers.id(sig), 0, 4));
// 		diamondArgsImpls.push(deployedFacets[facetName]);
// 	}

// 	const onePerson = m.contract("OnePersonOneVoteStrategy");
// 	const weighted = m.contract("WeightedSplitStrategy");
// 	const diamond = m.contract("VotingDiamond", [diamondArgsSelectors, diamondArgsImpls, owner]);

// 	const strategyAtDiamond = m.contractAt("StrategyFacet", diamond, { id: "StrategyFacetAtDiamond" });
// 	m.call(strategyAtDiamond, "setStrategy", [0, onePerson], { id: "SetStrategy_v4_0" });
// 	m.call(strategyAtDiamond, "setStrategy", [1, weighted], { id: "SetStrategy_v4_1" });

// 	return { diamond, onePerson, weighted };
// });
