import hre from "hardhat";
import abiJson from "../frontend/src/lib/abi/VotingHubInterface.json";

async function main() {
  const { ethers } = hre;
  const diamond = process.env.DIAMOND || "0x7bc06c482DEAd17c0e297aFbC32f6e63d3846650";
  const [owner, a1, a2, a3, a4] = await ethers.getSigners();
  const hub = new ethers.Contract(diamond, abiJson.abi, owner);
  const provider = ethers.provider;

  async function create(alg: number) {
    const now = BigInt((await provider.getBlock("latest"))!.timestamp);
    const tx = await hub.createSession(
      `compare-${alg}`,
      ["A", "B", "C"],
      [1n, 5n, 1n],
      now - 10n,
      now + 3600n,
      now + 7200n,
      alg,
      false,
      true,
      false,
      [],
      ethers.parseEther("0.001"),
    );
    await tx.wait();
    return (await hub.nextSessionId()) - 1n;
  }

  async function voteAll(id: bigint) {
    await (await hub.connect(a1).castVote(id, [{ optionId: 0n, weight: 1n }], true)).wait();
    await (await hub.connect(a2).castVote(id, [{ optionId: 2n, weight: 1n }], true)).wait();
    await (await hub.connect(a3).castVote(id, [{ optionId: 2n, weight: 1n }], true)).wait();
    await (await hub.connect(a4).castVote(id, [{ optionId: 1n, weight: 1n }], true)).wait();
  }

  const algs = [0, 2];
  const sessions: { alg: number; id: bigint }[] = [];
  for (const alg of algs) {
    const id = await create(alg);
    sessions.push({ alg, id });
  }
  for (const s of sessions) await voteAll(s.id);
  for (const s of sessions) {
    const totals: bigint[] = await hub.getOptionTotals(s.id);
    const winners: bigint[] = await hub.getWinners(s.id);
    console.log("alg", s.alg, "session", s.id.toString(), "totals", totals.map((t) => t.toString()), "winners", winners.map((w) => w.toString()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
