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
	let diamond: any;
	let coreImpl: string;

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

		const Core = await ethers.getContractFactory("CoreFacet", owner);
		const Delegation = await ethers.getContractFactory("DelegationFacet", owner);
		const Purchase = await ethers.getContractFactory("PurchaseFacet", owner);
		const Reveal = await ethers.getContractFactory("RevealFacet", owner);
		const Strategy = await ethers.getContractFactory("StrategyFacet", owner);
		const Admin = await ethers.getContractFactory("AdminFacet", owner);
		const Diamond = await ethers.getContractFactory("VotingDiamond", owner);
		const WeightedStrategy = await ethers.getContractFactory("WeightedSplitStrategy", owner);

		const core = await Core.deploy();
		const delegation = await Delegation.deploy();
		const purchase = await Purchase.deploy();
		const reveal = await Reveal.deploy();
		const strategy = await Strategy.deploy();
		const admin = await Admin.deploy();
		const weighted = await WeightedStrategy.deploy();
		coreImpl = await core.getAddress();

		const selectorDefs = [
			{ sig: "createSession(string,string[],uint256[],uint256,uint256,uint256,uint8,bool,bool,bool,address[],uint256)", impl: core },
			{ sig: "castVote(uint256,(uint256,uint256)[],bool)", impl: core },
			{ sig: "castAnonymousVote(uint256,bytes32,(uint256,uint256)[],bool)", impl: core },
			{ sig: "confirmVote(uint256)", impl: core },
			{ sig: "revokeVote(uint256)", impl: core },
			{ sig: "updateVote(uint256,(uint256,uint256)[],bool)", impl: core },
			{ sig: "getOptionTotals(uint256)", impl: core },
			{ sig: "getWinners(uint256)", impl: core },
			{ sig: "getOptions(uint256)", impl: core },
			{ sig: "getVoteAllocations(uint256,address)", impl: core },
			{ sig: "canSeeResults(uint256,address)", impl: core },
			{ sig: "delegateVote(uint256,address)", impl: delegation },
			{ sig: "purchaseWeight(uint256)", impl: purchase },
			{ sig: "setAuthorizedViewer(uint256,address,bool)", impl: reveal },
			{ sig: "revealResults(uint256)", impl: reveal },
			{ sig: "emitSessionEnd(uint256)", impl: reveal },
			{ sig: "setStrategy(uint8,address)", impl: strategy },
			{ sig: "clearStrategy(uint8)", impl: strategy },
			{ sig: "owner()", impl: admin },
			{ sig: "transferOwnership(address)", impl: admin },
			{ sig: "setVoterWeight(uint256,address,uint256)", impl: admin },
			{ sig: "nextSessionId()", impl: admin },
		];

		const selectorBytes = selectorDefs.map((d) => ethers.dataSlice(ethers.id(d.sig), 0, 4));
		const implAddrs = await Promise.all(selectorDefs.map(async (d) => d.impl.getAddress()));
		diamond = await Diamond.deploy(selectorBytes, implAddrs, owner.address);

		hub = await ethers.getContractAt("VotingHubInterface", await diamond.getAddress(), owner);

		for (const alg of [0, 1, 2]) {
			await hub.setStrategy(alg, await weighted.getAddress());
		}
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

		expect(before - after - BigInt(gasCost)).to.equal(ethers.parseEther("0.01"));
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
		await expect(hub.transferOwnership(ethers.ZeroAddress)).to.be.revertedWithCustomError(
			hub,
			"ZeroOwner",
		);
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

	it("allows strategy updates and rejects unset strategy", async () => {
		const Strategy = await ethers.getContractFactory("WeightedSplitStrategy", owner);
		const newStrategy = await Strategy.deploy();
		await expect(hub.setStrategy(0, ethers.ZeroAddress)).to.be.revertedWithCustomError(
			hub,
			"StrategyNotSet",
		);
		await hub.setStrategy(0, newStrategy);
		const sessionId = await createSession({ algorithm: 0 });
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true);
		const totals = await hub.connect(viewer).getOptionTotals(sessionId);
		expect(totals[0]).to.equal(1n);
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

	it("hits error branches for session creation and authorization", async () => {
		const block = await ethers.provider.getBlock("latest");
		const now = BigInt(block!.timestamp);
		await expect(
			hub.createSession(
				"none",
				[],
				[],
				now,
				now + 10n,
				now + 10n,
				0,
				true,
				true,
				true,
				[viewer.address],
				pricePerWeight,
			),
		).to.be.revertedWithCustomError(hub, "OptionsRequired");

		const sessionId = await createSession();
		await hub.setAuthorizedViewer(sessionId, viewer.address, true); // no-op return path
		await expect(hub.connect(voterA).revealResults(sessionId)).to.be.revertedWithCustomError(
			hub,
			"NotAuthorized",
		);
		const publicSession = await createSession({ concealResults: false });
		await expect(hub.revealResults(publicSession)).to.be.revertedWithCustomError(
			hub,
			"AlreadyPublic",
		);

		await hub.setAuthorizedViewer(publicSession, viewer.address, true);
		await hub.setAuthorizedViewer(publicSession, viewer.address, true);
	});

	it("covers anon errors and inactive confirm/revoke", async () => {
		const block = await ethers.provider.getBlock("latest");
		const now = BigInt(block!.timestamp);
		const anonOff = await createSession({ allowAnonymous: false });
		await expect(
			hub.connect(voterA).castAnonymousVote(anonOff, ethers.keccak256(ethers.toUtf8Bytes("x")), [{ optionId: 0n, weight: 1n }], true),
		).to.be.revertedWithCustomError(hub, "AnonDisabled");
		const anonZero = await createSession({ allowAnonymous: true });
		await expect(
			hub.connect(voterA).castAnonymousVote(anonZero, ethers.ZeroHash, [{ optionId: 0n, weight: 1n }], true),
		).to.be.revertedWithCustomError(hub, "AnonIdRequired");

		const futureSession = await createSession({ startTime: now + 5000n, endTime: now + 6000n });
		await expect(hub.connect(voterA).confirmVote(futureSession)).to.be.revertedWithCustomError(
			hub,
			"Inactive",
		);

		const endedSession = await createSession({ startTime: now - 1000n, endTime: now - 10n });
		await expect(hub.connect(voterA).revokeVote(endedSession)).to.be.revertedWithCustomError(
			hub,
			"Inactive",
		);
		const noVoteSession = await createSession();
		await expect(hub.connect(voterA).revokeVote(noVoteSession)).to.be.revertedWithCustomError(
			hub,
			"NoVote",
		);
	});

	it("covers delegation edge cases", async () => {
		const sessionId = await createSession();
		await expect(hub.connect(voterA).delegateVote(sessionId, voterA.address)).to.be.revertedWithCustomError(
			hub,
			"SelfDelegation",
		);
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true);
		await expect(hub.connect(voterA).delegateVote(sessionId, voterB.address)).to.be.revertedWithCustomError(
			hub,
			"AlreadyVoted",
		);

		const zeroWeightSession = await createSession();
		await hub.connect(owner).setVoterWeight(zeroWeightSession, voterC.address, 0n);
		await expect(
			hub.connect(voterC).delegateVote(zeroWeightSession, voterB.address),
		).to.be.revertedWithCustomError(hub, "NoWeight");

		const loopSession = await createSession();
		await hub.connect(voterA).delegateVote(loopSession, voterB.address);
		await expect(
			hub.connect(voterB).delegateVote(loopSession, voterA.address),
		).to.be.revertedWithCustomError(hub, "DelegationLoop");
	});

	it("covers purchase restrictions and reentrancy", async () => {
		const block = await ethers.provider.getBlock("latest");
		const now = BigInt(block!.timestamp);
		const purchasesOff = await createSession({ allowMultiVoteWithEth: false });
		await expect(
			hub.connect(voterA).purchaseWeight(purchasesOff, { value: pricePerWeight }),
		).to.be.revertedWithCustomError(hub, "PurchasesOff");

		const ended = await createSession({ startTime: now - 1000n, endTime: now - 10n });
		await expect(
			hub.connect(voterA).purchaseWeight(ended, { value: pricePerWeight }),
		).to.be.revertedWithCustomError(hub, "Inactive");

		await expect(
			hub.connect(voterA).purchaseWeight(9999, { value: pricePerWeight }),
		).to.be.revertedWithCustomError(hub, "SessionMissing");

		const active = await createSession({ pricePerWeight: ethers.parseEther("0.01") });
		const Attacker = await ethers.getContractFactory("ReenterPurchaser", owner);
		const attacker = await Attacker.deploy(await hub.getAddress(), active);
		await expect(
			attacker.connect(owner).attack({ value: ethers.parseEther("0.015") }),
		).to.be.revertedWithCustomError(hub, "RefundFailed");
	});

	it("covers emitSessionEnd double call and missing session guard", async () => {
		const block = await ethers.provider.getBlock("latest");
		const now = BigInt(block!.timestamp);
		const sessionId = await createSession({ startTime: now - 100n, endTime: now - 10n });
		await hub.emitSessionEnd(sessionId);
		await expect(hub.emitSessionEnd(sessionId)).to.be.revertedWithCustomError(hub, "AlreadyEmitted");
		await expect(hub.getOptions(9999)).to.be.revertedWithCustomError(hub, "SessionMissing");
	});

	it("covers inactive emitSessionEnd and delegate reverts", async () => {
		const block = await ethers.provider.getBlock("latest");
		const now = BigInt(block!.timestamp);
		const sessionId = await createSession({ startTime: now + 1000n, endTime: now + 2000n });
		await expect(hub.emitSessionEnd(sessionId)).to.be.revertedWithCustomError(hub, "Inactive");
		await expect(
			hub.connect(voterA).delegateVote(sessionId, voterB.address),
		).to.be.revertedWithCustomError(hub, "Inactive");
	});

	it("covers delegation already delegated and to confirmed voter paths", async () => {
		const sessionId = await createSession();
		await hub.connect(voterA).delegateVote(sessionId, voterB.address);
		await expect(
			hub.connect(voterA).delegateVote(sessionId, voterC.address),
		).to.be.revertedWithCustomError(hub, "Delegated");

		const sessionId2 = await createSession();
		await hub.connect(voterB).castVote(sessionId2, [{ optionId: 0n, weight: 1n }], true);
		await hub.connect(voterA).delegateVote(sessionId2, voterB.address);
		const totals = await hub.connect(viewer).getOptionTotals(sessionId2);
		expect(totals[0]).to.equal(2n);
	});

	it("covers bad option and missing strategy errors", async () => {
		const sessionId = await createSession();
		await expect(
			hub.connect(voterA).castVote(sessionId, [{ optionId: 99n, weight: 1n }], true),
		).to.be.revertedWithCustomError(hub, "BadOption");

		const sessionId2 = await createSession({ algorithm: 2 });
		await hub.clearStrategy(2);
		await expect(
			hub.connect(voterA).castVote(sessionId2, [{ optionId: 0n, weight: 1n }], true),
		).to.be.revertedWithCustomError(hub, "StrategyNotSet");

		await expect(
			hub.connect(voterA).setStrategy(0, viewer.address),
		).to.be.revertedWithCustomError(hub, "NotOwner");

		await expect(
			hub.connect(voterA).clearStrategy(0),
		).to.be.revertedWithCustomError(hub, "NotOwner");
	});

	it("covers bad weight and NoConfirmedVote defensive path", async () => {
		const sessionId = await createSession();
		await expect(
			hub.connect(voterA).castVote(sessionId, [], true),
		).to.be.revertedWithCustomError(hub, "BadWeight");
	});

	it("blocks unauthorized getWinners when concealed", async () => {
		const sessionId = await createSession();
		await hub.connect(voterA).castVote(sessionId, [{ optionId: 0n, weight: 1n }], true);
		await expect(
			hub.connect(voterA).getWinners(sessionId),
		).to.be.revertedWithCustomError(hub, "NotAuthorized");
	});

	it("reverts on unknown selector and admin session missing", async () => {
		const unknown = new ethers.Contract(await diamond.getAddress(), ["function noSuchFn() view returns (uint256)"], owner);
		await expect(unknown.noSuchFn()).to.be.revertedWithCustomError(hub, "StrategyNotSet");

		await expect(
			hub.connect(owner).setVoterWeight(9999, voterA.address, 5n),
		).to.be.revertedWithCustomError(hub, "SessionMissing");

		await expect(
			diamond.connect(voterA).setFacet("0x12345678", coreImpl),
		).to.be.revertedWithCustomError(hub, "NotOwner");
		await diamond.setFacet("0x12345678", coreImpl);
	});

	it("covers additional admin and reveal error branches", async () => {
		const nextId = await hub.nextSessionId();
		expect(nextId).to.equal(0n);
		await expect(hub.revealResults(9999)).to.be.revertedWithCustomError(hub, "SessionMissing");
		await expect(hub.setAuthorizedViewer(9999, viewer.address, true)).to.be.revertedWithCustomError(
			hub,
			"SessionMissing",
		);
		await hub.clearStrategy(1);
	});
});
