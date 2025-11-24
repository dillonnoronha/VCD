import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

type Allocation = { optionId: bigint; weight: bigint };

describe("VotingHub", () => {
	const pricePerWeight = ethers.parseEther("0.001");
	let hub: any;
	let owner: any;
	let viewer: any;
	let voterA: any;
	let voterB: any;
	let voterC: any;

	const advanceTime = async (seconds: number) => {
		await ethers.provider.send("evm_increaseTime", [seconds]);
		await ethers.provider.send("evm_mine", []);
	};

	const createSession = async (opts: Partial<{
		name: string;
		optionNames: string[];
		optionWeights: bigint[];
		startTime: bigint;
		endTime: bigint;
		revealTime: bigint;
		algorithm: number;
		allowAnonymous: boolean;
		allowMultiVoteWithEth: boolean;
		concealResults: boolean;
		authorizedViewers: string[];
		pricePerWeight: bigint;
	}> = {}) => {
		const block = await ethers.provider.getBlock("latest");
		const now = BigInt(block!.timestamp);
		const start = opts.startTime ?? now - 10n;
		const end = opts.endTime ?? now + 3600n;
		const reveal = opts.revealTime ?? now + 7200n;
		const optionNames = opts.optionNames ?? ["A", "B"];
		const optionWeights = opts.optionWeights ?? [1n, 1n];
		const nextId = await hub.nextSessionId();

		await hub.createSession(
			opts.name ?? "Session",
			optionNames,
			optionWeights,
			start,
			end,
			reveal,
			opts.algorithm ?? 0,
			opts.allowAnonymous ?? true,
			opts.allowMultiVoteWithEth ?? true,
			opts.concealResults ?? true,
			opts.authorizedViewers ?? [viewer.address],
			opts.pricePerWeight ?? pricePerWeight,
		);

		return nextId;
	};

	beforeEach(async () => {
		[owner, viewer, voterA, voterB, voterC] = await ethers.getSigners();
		const VotingHub = await ethers.getContractFactory("VotingHub", owner);
		hub = await VotingHub.deploy();
	});

	it("creates a session with options", async () => {
		const sessionId = await createSession();
		const opts = await hub.getOptions(sessionId);
		expect(opts.length).to.equal(2);
		expect(opts[0].name).to.equal("A");
		expect(opts[1].weight).to.equal(1n);
	});

	it("casts and updates a vote", async () => {
		const sessionId = await createSession();
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true);
		let totals = await hub.connect(viewer).getOptionTotals(sessionId);
		expect(totals[0]).to.equal(1n);
		expect(totals[1]).to.equal(0n);

		await hub.connect(voterA).castVote(sessionId, [{ optionId: 1n, weight: 1n }], true);
		totals = await hub.connect(viewer).getOptionTotals(sessionId);
		expect(totals[0]).to.equal(0n);
		expect(totals[1]).to.equal(1n);
	});

	it("revokes a vote before session ends", async () => {
		const sessionId = await createSession();
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true);
		await hub.connect(voterA).revokeVote(sessionId);
		const totals = await hub.connect(viewer).getOptionTotals(sessionId);
		expect(totals[0]).to.equal(0n);
	});

	it("delegates votes and counts delegated weight", async () => {
		const sessionId = await createSession();
		await hub.connect(voterA).delegateVote(sessionId, voterB.address);
		await hub.connect(voterB).castVote(sessionId, [{ optionId: 0n, weight: 2n }], true);
		const totals = await hub.connect(viewer).getOptionTotals(sessionId);
		expect(totals[0]).to.equal(2n);
	});

	it("purchases additional weight and applies it", async () => {
		const sessionId = await createSession();
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true);
		await hub
			.connect(voterA)
			.purchaseWeight(sessionId, { value: pricePerWeight });
		const totals = await hub.connect(viewer).getOptionTotals(sessionId);
		expect(totals[0]).to.equal(2n);
	});

	it("hides results until reveal time or authorization", async () => {
		const block = await ethers.provider.getBlock("latest");
		const now = BigInt(block!.timestamp);
		const sessionId = await createSession({ revealTime: now + 1000n });
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true);

		await expect(hub.connect(voterA).getOptionTotals(sessionId)).to.be.revertedWithCustomError(
			hub,
			"NotAuthorized",
		);

		const totalsViewer = await hub.connect(viewer).getOptionTotals(sessionId);
		expect(totalsViewer[0]).to.equal(1n);

		await advanceTime(1200);
		const totalsAfter = await hub.connect(voterA).getOptionTotals(sessionId);
		expect(totalsAfter[0]).to.equal(1n);
	});

	it("handles vote splitting with custom weights", async () => {
		const sessionId = await createSession();
		await hub.connect(owner).setVoterWeight(sessionId, voterA.address, 3n);
		await hub
			.connect(voterA)
			.castVote(
				sessionId,
				[
					{ optionId: 0n, weight: 1n },
					{ optionId: 1n, weight: 2n },
				],
				true,
			);
		const totals = await hub.connect(viewer).getOptionTotals(sessionId);
		expect(totals[0]).to.equal(1n);
		expect(totals[1]).to.equal(2n);
	});

	it("supports anonymous voting", async () => {
		const sessionId = await createSession({ allowAnonymous: true });
		const anonId = ethers.keccak256(ethers.toUtf8Bytes("alias-1"));
		await hub
			.connect(voterA)
			.castAnonymousVote(sessionId, anonId, [{ optionId: 1n, weight: 1n }], true);
		const totals = await hub.connect(viewer).getOptionTotals(sessionId);
		expect(totals[1]).to.equal(1n);
	});

	it("returns all winners on ties", async () => {
		const sessionId = await createSession();
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true);
		await hub.connect(voterB).castVote(sessionId, [{ optionId: 1n, weight: 1n }], true);
		const winners = await hub.connect(viewer).getWinners(sessionId);
		expect(winners.length).to.equal(2);
	});

	it("handles many sequential votes from multiple voters and enforces weights", async () => {
		const sessionId = await createSession();
		await hub.connect(owner).setVoterWeight(sessionId, voterA.address, 4n);
		await hub.connect(owner).setVoterWeight(sessionId, voterB.address, 3n);
		await hub.connect(owner).setVoterWeight(sessionId, voterC.address, 2n);

		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 2n }], true);
		await hub.connect(voterB).castVote(sessionId, [{ optionId: 1n, weight: 1n }], true);
		await hub.connect(voterC).castVote(sessionId, [{ optionId: 0n, weight: 2n }], true);

		await expect(
			hub.connect(voterA).castVote(sessionId, [{ optionId: 1n, weight: 5n }], true),
		).to.be.revertedWithCustomError(hub, "BadWeight");

		await hub.connect(voterA).castVote(sessionId, [{ optionId: 1n, weight: 3n }], true);
		await hub.connect(voterB).castVote(sessionId, [{ optionId: 0n, weight: 2n }], true);
		await hub.connect(voterC).revokeVote(sessionId);

		const totals = await hub.connect(viewer).getOptionTotals(sessionId);
		// Option 0: voterB(2) = 2 ; voterA final = 0; voterC revoked
		// Option 1: voterA(3) + voterB(0) = 3
		expect(totals[0]).to.equal(2n);
		expect(totals[1]).to.equal(3n);
	});

	it("prevents post-delegation voting and looped delegation", async () => {
		const sessionId = await createSession();
		await hub.connect(voterA).delegateVote(sessionId, voterB.address);

		await expect(
			hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true),
		).to.be.revertedWithCustomError(hub, "Delegated");

		await expect(
			hub.connect(voterB).delegateVote(sessionId, voterA.address),
		).to.be.revertedWithCustomError(hub, "DelegationLoop");
	});
});
