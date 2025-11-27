// scripts/deployStandalone.mjs
import { readFile } from "node:fs/promises";
import { ethers } from "ethers";

async function loadArtifact(relPath) {
  const json = await readFile(`./artifacts/${relPath}`, "utf8");
  return JSON.parse(json);
}

async function deployContract(artifactRelPath, signer) {
  const artifact = await loadArtifact(artifactRelPath);
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    signer
  );
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`Deployed ${artifactRelPath.split("/").slice(-1)[0]} at: ${addr}`);
  return { contract, addr };
}

async function main() {
  // 1) Connect to local Hardhat node
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const signer = await provider.getSigner(0);
  const ownerAddress = await signer.getAddress();
  console.log("Deploying from:", ownerAddress);

  // 2) Deploy facets & strategy (paths match your repo layout)
  const { contract: core, addr: coreAddr } = await deployContract(
    "contracts/diamond/facets/CoreFacet.sol/CoreFacet.json",
    signer
  );
  const { addr: delegationAddr } = await deployContract(
    "contracts/diamond/facets/DelegationFacet.sol/DelegationFacet.json",
    signer
  );
  const { addr: purchaseAddr } = await deployContract(
    "contracts/diamond/facets/PurchaseFacet.sol/PurchaseFacet.json",
    signer
  );
  const { addr: revealAddr } = await deployContract(
    "contracts/diamond/facets/RevealFacet.sol/RevealFacet.json",
    signer
  );
  const { addr: strategyAddr } = await deployContract(
    "contracts/diamond/facets/StrategyFacet.sol/StrategyFacet.json",
    signer
  );
  const { addr: adminAddr } = await deployContract(
    "contracts/diamond/facets/AdminFacet.sol/AdminFacet.json",
    signer
  );
  const { addr: weightedAddr } = await deployContract(
    "contracts/voting/strategies/WeightedSplitStrategy.sol/WeightedSplitStrategy.json",
    signer
  );

  // 3) Build selector -> impl mapping (copied from test/VotingHub.ts)
  const selectorDefs = [
    {
      sig: "createSession(string,string[],uint256[],uint256,uint256,uint256,uint8,bool,bool,bool,address[],uint256)",
      impl: coreAddr,
    },
    { sig: "castVote(uint256,(uint256,uint256)[],bool)", impl: coreAddr },
    {
      sig: "castAnonymousVote(uint256,bytes32,(uint256,uint256)[],bool)",
      impl: coreAddr,
    },
    { sig: "confirmVote(uint256)", impl: coreAddr },
    { sig: "revokeVote(uint256)", impl: coreAddr },
    { sig: "updateVote(uint256,(uint256,uint256)[],bool)", impl: coreAddr },
    { sig: "getOptionTotals(uint256)", impl: coreAddr },
    { sig: "getWinners(uint256)", impl: coreAddr },
    { sig: "getOptions(uint256)", impl: coreAddr },
    { sig: "getVoteAllocations(uint256,address)", impl: coreAddr },
    { sig: "canSeeResults(uint256,address)", impl: coreAddr },
    { sig: "getSessionMeta(uint256)", impl: coreAddr },
    { sig: "listSessions()", impl: coreAddr },

    { sig: "delegateVote(uint256,address)", impl: delegationAddr },

    { sig: "purchaseWeight(uint256)", impl: purchaseAddr },

    { sig: "setAuthorizedViewer(uint256,address,bool)", impl: revealAddr },
    { sig: "revealResults(uint256)", impl: revealAddr },
    { sig: "emitSessionEnd(uint256)", impl: revealAddr },

    { sig: "setStrategy(uint8,address)", impl: strategyAddr },
    { sig: "clearStrategy(uint8)", impl: strategyAddr },

    { sig: "owner()", impl: adminAddr },
    { sig: "transferOwnership(address)", impl: adminAddr },
    { sig: "setVoterWeight(uint256,address,uint256)", impl: adminAddr },
    { sig: "nextSessionId()", impl: adminAddr },
  ];

  const selectorBytes = selectorDefs.map((d) =>
    ethers.dataSlice(ethers.id(d.sig), 0, 4)
  );
  const implAddrs = selectorDefs.map((d) => d.impl);

  // 4) Deploy VotingDiamond with constructor(selectors, impls, owner)
  const diamondArtifact = await loadArtifact(
    "contracts/diamond/VotingDiamond.sol/VotingDiamond.json"
  );
  const diamondFactory = new ethers.ContractFactory(
    diamondArtifact.abi,
    diamondArtifact.bytecode,
    signer
  );

  console.log("Deploying VotingDiamond...");
  const diamond = await diamondFactory.deploy(
    selectorBytes,
    implAddrs,
    ownerAddress
  );
  await diamond.waitForDeployment();
  const diamondAddr = await diamond.getAddress();
  console.log("✅ VotingDiamond deployed at:", diamondAddr);

  // 5) (Optional) Wire up strategy for algorithms 0,1,2 via VotingHubInterface
  try {
    const hubArtifact = await loadArtifact(
      "contracts/VotingHubInterface.sol/VotingHubInterface.json"
    );
    const hub = new ethers.Contract(diamondAddr, hubArtifact.abi, signer);

    for (const alg of [0, 1, 2]) {
      const tx = await hub.setStrategy(alg, weightedAddr);
      await tx.wait();
      console.log(
        `setStrategy(${alg}, ${weightedAddr}) confirmed in tx ${tx.hash}`
      );
    }
  } catch (e) {
    console.warn(
      "Warning: could not wire strategies via VotingHubInterface. You can still set them later from an owner account."
    );
    console.warn(e?.message ?? e);
  }

  console.log("\n=== FINAL ADDRESS TO USE IN FRONTEND ===");
  console.log("DIAMOND_ADDRESS:", diamondAddr);
}

main().catch((err) => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
