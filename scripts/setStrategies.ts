import { ethers } from "hardhat";

/**
 * Deploy a WeightedSplitStrategy and wire algorithms 0/1/2
 * on an already-deployed VotingDiamond.
 *
 * Usage:
 *   npx hardhat run scripts/setStrategies.ts --network lan --diamond 0x...
 */
async function main() {
  const diamond = process.env.DIAMOND || process.env.diamond || process.argv.find((a) => a.startsWith("--diamond"))?.split("=")[1];
  if (!diamond || diamond.length !== 42) {
    throw new Error("Pass --diamond <address> or DIAMOND env var");
  }

  const [owner] = await ethers.getSigners();
  console.log("Using owner", owner.address);
  console.log("Diamond", diamond);

  const WeightedSplitStrategy = await ethers.getContractFactory("WeightedSplitStrategy");
  const strategy = await WeightedSplitStrategy.deploy();
  await strategy.waitForDeployment();
  const stratAddr = await strategy.getAddress();
  console.log("Deployed WeightedSplitStrategy at", stratAddr);

  const StrategyFacet = await ethers.getContractFactory("StrategyFacet");
  const facet = StrategyFacet.attach(diamond);

  for (const alg of [0, 1, 2]) {
    const tx = await facet.setStrategy(alg, stratAddr);
    await tx.wait();
    console.log(`setStrategy(${alg}) -> ${stratAddr}`);
  }

  console.log("Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
