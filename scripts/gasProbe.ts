import { network } from "hardhat";

const { ethers } = await network.connect();

async function gasUsed(label: string, txPromise: Promise<any>) {
	const tx = await txPromise;
	const receipt = await tx.wait();
	console.log(`${label}: ${receipt.gasUsed.toString()} gas`);
	return receipt.gasUsed;
}

async function main() {
	const [owner, viewer, voterA, voterB] = await ethers.getSigners();
	const VotingHub = await ethers.getContractFactory("VotingHub", owner);
	const hub = await VotingHub.deploy();
	await hub.waitForDeployment();

	const block = await ethers.provider.getBlock("latest");
	const now = BigInt(block!.timestamp);
	const start = now - 10n;
	const end = now + 3600n;
	const reveal = now + 7200n;
	const pricePerWeight = ethers.parseEther("0.001");

	const sessionId = await hub.nextSessionId();
	await gasUsed(
		"createSession",
		hub.createSession(
			"Session",
			["A", "B"],
			[1n, 1n],
			start,
			end,
			reveal,
			0,
			true,
			true,
			true,
			[viewer.address],
			pricePerWeight,
		),
	);

	await gasUsed("castVote (finalize=true)", hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true));

	await gasUsed("castVote (update)", hub.connect(voterA).castVote(sessionId, [{ optionId: 1n, weight: 1n }], true));

	const _ = await gasUsed(
		"castVote (prepare only)",
		hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], false),
	);
	await gasUsed("confirmVote", hub.connect(voterA).confirmVote(sessionId));

	await gasUsed("revokeVote", hub.connect(voterA).revokeVote(sessionId));

	await gasUsed("delegateVote", hub.connect(voterA).delegateVote(sessionId, voterB.address));
	await gasUsed(
		"castVote (delegated weight)",
		hub.connect(voterB).castVote(sessionId, [{ optionId: 0n, weight: 2n }], true),
	);

	await gasUsed("purchaseWeight", hub.connect(voterB).purchaseWeight(sessionId, { value: pricePerWeight }));

	const anonId = ethers.keccak256(ethers.toUtf8Bytes("alias-1"));
	await gasUsed(
		"castAnonymousVote",
		hub.connect(viewer).castAnonymousVote(sessionId, anonId, [{ optionId: 1n, weight: 1n }], true),
	);

	await gasUsed("revealResults", hub.connect(owner).revealResults(sessionId));
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
