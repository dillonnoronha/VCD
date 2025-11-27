// scripts/deployDiamond.js
import { network } from "hardhat";

const { viem, networkName } = await network.connect();

const client = await viem.getPublicClient();

console.log(`Deploying VotingDiamond to ${networkName}...`);

const diamond = await viem.deployContract("VotingDiamond");

console.log("VotingDiamond address:", diamond.address);

// (Optional) wait for 1 confirmation so you're sure it's mined
const receipt = await client.waitForTransactionReceipt({
  hash: diamond.deploymentTransactionHash,
  confirmations: 1,
});

console.log("Deployment tx confirmed in block:", receipt.blockNumber);
console.log("Deployment successful!");
