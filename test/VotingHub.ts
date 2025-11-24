import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// type Allocation = { optionId: bigint; weight: bigint };

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

	it("rejects bad session creation and owner-only setters", async () => {
		const block = await ethers.provider.getBlock("latest");
		const now = BigInt(block!.timestamp);

		await expect(
			hub.createSession("bad", ["A"], [1n, 2n], now, now + 10n, now + 20n, 0, true, true, true, [viewer.address], pricePerWeight),
		).to.be.revertedWithCustomError(hub, "OptionMismatch");

		await expect(
			hub.createSession("bad", ["A"], [1n], now + 20n, now + 10n, now + 30n, 0, true, true, true, [viewer.address], pricePerWeight),
		).to.be.revertedWithCustomError(hub, "InvalidWindow");

		const sessionId = await createSession();
		await expect(
			hub.connect(voterA).setVoterWeight(sessionId, voterA.address, 2n),
		).to.be.revertedWithCustomError(hub, "NotOwner");
		await expect(
			hub.connect(voterA).setAuthorizedViewer(sessionId, voterA.address, true),
		).to.be.revertedWithCustomError(hub, "NotOwner");
	});

	it("blocks confirm without prepare and double confirm", async () => {
		const sessionId = await createSession();
		await expect(hub.connect(voterA).confirmVote(sessionId)).to.be.revertedWithCustomError(
			hub,
			"NothingPending",
		);
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], false);
		await hub.connect(voterA).confirmVote(sessionId);
		await expect(hub.connect(voterA).confirmVote(sessionId)).to.be.revertedWithCustomError(
			hub,
			"NothingPending",
		);
	});

	it("blocks unauthorized reveal and emits session end after time", async () => {
		const block = await ethers.provider.getBlock("latest");
		const now = BigInt(block!.timestamp);
		const sessionId = await createSession({ revealTime: now + 1000n });
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true);

		await expect(hub.connect(voterA).revealResults(sessionId)).to.be.revertedWithCustomError(
			hub,
			"NotAuthorized",
		);

		await advanceTime(4000);
		await expect(hub.emitSessionEnd(sessionId)).to.emit(hub, "SessionEnded");
	});

	it("processes refund on purchase when value not multiple of pricePerWeight", async () => {
		const sessionId = await createSession({ pricePerWeight: ethers.parseEther("0.01") });
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true);

		const before = await ethers.provider.getBalance(voterA.address);
		const tx = await hub.connect(voterA).purchaseWeight(sessionId, { value: ethers.parseEther("0.015") });
		const receipt = await tx.wait();
		const gasCost = receipt!.gasUsed * receipt!.gasPrice!;
		const after = await ethers.provider.getBalance(voterA.address);

		expect(before - after - gasCost).to.equal(ethers.parseEther("0.01"));
	});

	it("rejects voting outside of active window", async () => {
		const block = await ethers.provider.getBlock("latest");
		const now = BigInt(block!.timestamp);
		const sessionId = await createSession({ startTime: now + 5000n, endTime: now + 6000n });
		await expect(
			hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true),
		).to.be.revertedWithCustomError(hub, "Inactive");

		await advanceTime(6000);
		await expect(
			hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true),
		).to.be.revertedWithCustomError(hub, "Inactive");
	});

	it("handles ownership transfer rules", async () => {
		await expect(hub.transferOwnership(ethers.ZeroAddress)).to.be.revertedWith("Zero owner");
		await hub.transferOwnership(viewer.address);
		expect(await hub.owner()).to.equal(viewer.address);
		await expect(hub.transferOwnership(voterA.address)).to.be.revertedWithCustomError(
			hub,
			"NotOwner",
		);
	});

	it("exposes vote allocations to authorized viewers only", async () => {
		const sessionId = await createSession();
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], false);
		await expect(
			hub.connect(voterB).getVoteAllocations(sessionId, voterA.address),
		).to.be.revertedWithCustomError(hub, "NotAuthorized");

		await hub.setAuthorizedViewer(sessionId, voterB.address, true);
		const res = await hub.connect(voterB).getVoteAllocations(sessionId, voterA.address);
		expect(res.usedWeight).to.equal(1n);
	});

	it("reveals results automatically after end time even if concealed", async () => {
		const block = await ethers.provider.getBlock("latest");
		const now = BigInt(block!.timestamp);
		const sessionId = await createSession({
			startTime: now - 10n,
			endTime: now + 10n,
			revealTime: now + 10_000n,
		});
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true);

		await expect(
			hub.connect(voterA).getOptionTotals(sessionId),
		).to.be.revertedWithCustomError(hub, "NotAuthorized");

		await advanceTime(20);
		const totals = await hub.connect(voterA).getOptionTotals(sessionId);
		expect(totals[0]).to.equal(1n);
	});

	it("allows public visibility when concealResults is false", async () => {
		const sessionId = await createSession({ concealResults: false });
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 1n, weight: 1n }], true);
		const totals = await hub.connect(voterC).getOptionTotals(sessionId);
		expect(totals[1]).to.equal(1n);
	});

	it("enforces price configuration and value thresholds when purchasing weight", async () => {
		const sessionId = await createSession({ pricePerWeight: 0n });
		await expect(
			hub.connect(voterA).purchaseWeight(sessionId, { value: pricePerWeight }),
		).to.be.revertedWithCustomError(hub, "PriceUnset");

		const sessionId2 = await createSession({ pricePerWeight: ethers.parseEther("0.01") });
		await expect(
			hub.connect(voterA).purchaseWeight(sessionId2, { value: ethers.parseEther("0.001") }),
		).to.be.revertedWithCustomError(hub, "ValueTooLow");
	});

	it("emits reveal results and exposes canSeeResults helper", async () => {
		const sessionId = await createSession();
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true);
		await expect(hub.revealResults(sessionId)).to.emit(hub, "ResultsRevealed");
		expect(await hub.canSeeResults(sessionId, voterB.address)).to.equal(true);
	});

	it("updates votes via updateVote entry", async () => {
		const sessionId = await createSession();
		await hub.connect(voterA).updateVote(sessionId, [{ optionId: 0n, weight: 1n }], true);
		await hub.connect(voterA).updateVote(sessionId, [{ optionId: 1n, weight: 1n }], true);
		const totals = await hub.connect(viewer).getOptionTotals(sessionId);
		expect(totals[1]).to.equal(1n);
	});
});
