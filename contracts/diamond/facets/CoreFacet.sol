// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VotingStorage} from "../lib/VotingStorage.sol";
import {VotingErrors} from "../../voting/Errors.sol";
import {Algorithm, VoteStatus, Option, Allocation, VoteRecord, VoterState, Session} from "../../voting/Types.sol";
import {IVotingStrategy} from "../../voting/strategies/IVotingStrategy.sol";

contract CoreFacet is VotingErrors {
	using VotingStorage for VotingStorage.Layout;

	event SessionCreated(uint256 indexed sessionId, string name, uint256 startTime, uint256 endTime);
	event VotePrepared(uint256 indexed sessionId, address indexed voter, bytes32 anonId, uint256 weight);
	event VoteCast(uint256 indexed sessionId, address indexed voter, bytes32 anonId, uint256 weight);
	event VoteUpdated(uint256 indexed sessionId, address indexed voter, bytes32 anonId, uint256 weight);
	event VoteRevoked(uint256 indexed sessionId, address indexed voter, bytes32 anonId);

	modifier onlyOwner() {
		if (msg.sender != VotingStorage.layout().owner) revert NotOwner();
		_;
	}

	function createSession(
		string memory name,
		string[] memory optionNames,
		uint256[] memory optionWeights,
		uint256 startTime,
		uint256 endTime,
		uint256 revealTime,
		Algorithm algorithm,
		bool allowAnonymous,
		bool allowMultiVoteWithEth,
		bool concealResults,
		address[] memory authorizedViewers,
		uint256 pricePerWeight,
		uint256 defaultBaseWeight
	) external onlyOwner returns (uint256 id) {
		if (optionNames.length == 0) revert OptionsRequired();
		if (optionNames.length != optionWeights.length) revert OptionMismatch();
		if (startTime >= endTime) revert InvalidWindow();
		if (uint8(algorithm) > uint8(Algorithm.WeightedSplit)) revert InvalidAlgorithm();

		VotingStorage.Layout storage ds = VotingStorage.layout();
		id = ds.nextSessionId++;
		Session storage s = ds.sessions[id];
		s.name = name;
		s.startTime = startTime;
		s.endTime = endTime;
		s.revealTime = revealTime == 0 ? endTime : revealTime;
		s.algorithm = algorithm;
		s.allowAnonymous = allowAnonymous;
		s.allowMultiVoteWithEth = allowMultiVoteWithEth;
		s.concealResults = concealResults;
		s.pricePerWeight = pricePerWeight;
		s.defaultBaseWeight = defaultBaseWeight == 0 ? 1 : defaultBaseWeight;

		for (uint256 i; i < optionNames.length; ) {
			uint256 optWeight = optionWeights[i] == 0 ? 1 : optionWeights[i];
			s.options.push(Option({name: optionNames[i], weight: optWeight}));
			unchecked {
				++i;
			}
		}

		s.authorizedViewers[msg.sender] = true;
		for (uint256 j; j < authorizedViewers.length; ) {
			if (!s.authorizedViewers[authorizedViewers[j]]) {
				s.authorizedViewers[authorizedViewers[j]] = true;
			}
			unchecked {
				++j;
			}
		}

		ds.sessionIds.push(id);

		emit SessionCreated(id, name, startTime, endTime);
	}

	function castVote(uint256 sessionId, Allocation[] memory allocations, bool finalize) external {
		_cast(sessionId, msg.sender, allocations, finalize, false, bytes32(0));
	}

	function castAnonymousVote(uint256 sessionId, bytes32 anonId, Allocation[] memory allocations, bool finalize) external {
		Session storage s = _session(sessionId);
		if (!s.allowAnonymous) revert AnonDisabled();
		if (anonId == bytes32(0)) revert AnonIdRequired();
		_cast(sessionId, msg.sender, allocations, finalize, true, anonId);
	}

	function confirmVote(uint256 sessionId) external {
		Session storage s = _session(sessionId);
		if (!_isActive(s)) revert Inactive();
		VoteRecord storage vr = s.votes[msg.sender];
		if (vr.status != VoteStatus.Pending) revert NothingPending();
		_applyToTotals(s, vr, true);
		vr.status = VoteStatus.Confirmed;
		emit VoteCast(sessionId, msg.sender, vr.anonId, vr.usedWeight);
	}

	function revokeVote(uint256 sessionId) external {
		Session storage s = _session(sessionId);
		if (!_isActive(s)) revert Inactive();
		VoteRecord storage vr = s.votes[msg.sender];
		if (vr.status == VoteStatus.None) revert NoVote();
		if (vr.status == VoteStatus.Confirmed) {
			_applyToTotals(s, vr, false);
		}
		_clearAllocations(vr);
		vr.status = VoteStatus.None;
		vr.usedWeight = 0;
		emit VoteRevoked(sessionId, msg.sender, vr.anonId);
	}

	function updateVote(uint256 sessionId, Allocation[] memory allocations, bool finalize) external {
		_cast(sessionId, msg.sender, allocations, finalize, false, bytes32(0));
		emit VoteUpdated(sessionId, msg.sender, bytes32(0), _sumAllocations(allocations));
	}

	function _session(uint256 sessionId) internal view returns (Session storage s) {
		s = VotingStorage.layout().sessions[sessionId];
		if (s.endTime == 0) revert SessionMissing();
	}

	function _isActive(Session storage s) internal view returns (bool) {
		return block.timestamp >= s.startTime && block.timestamp < s.endTime;
	}

	function _availableWeight(VoterState storage st) internal view returns (uint256) {
		uint256 base = st.exists ? st.baseWeight : 1;
		return base + st.purchasedWeight + st.receivedDelegatedWeight;
	}

		function _ensureState(Session storage s, address voter) internal returns (VoterState storage) {
			VoterState storage st = s.voterStates[voter];
			if (!st.exists) {
				st.exists = true;
				st.baseWeight = s.defaultBaseWeight == 0 ? 1 : s.defaultBaseWeight;
				st.receivedDelegatedWeight = 0;
			}
			return st;
		}

	function _sumAllocations(Allocation[] memory allocations) internal pure returns (uint256 total) {
		for (uint256 i; i < allocations.length; ) {
			total += allocations[i].weight;
			unchecked {
				++i;
			}
		}
	}

	function _cast(
		uint256 sessionId,
		address voter,
		Allocation[] memory allocations,
		bool finalize,
		bool isAnon,
		bytes32 anonId
	) internal {
		Session storage s = _session(sessionId);
		if (!_isActive(s)) revert Inactive();
		if (allocations.length == 0) revert BadWeight();

		VoterState storage st = _ensureState(s, voter);
		if (st.delegated) revert Delegated();

		for (uint256 i; i < allocations.length; ) {
			if (allocations[i].optionId >= s.options.length) revert BadOption();
			unchecked {
				++i;
			}
		}

		uint256 requested = _sumAllocations(allocations);
		uint256 available = _availableWeight(st);
		if (requested == 0 || requested > available) revert BadWeight();

		VoteRecord storage vr = s.votes[voter];
		if (vr.status == VoteStatus.Confirmed) {
			_applyToTotals(s, vr, false);
		}

		if (!st.listed) {
			s.voterList.push(voter);
			st.listed = true;
		}

		_storeAllocations(vr, allocations);
		vr.anonymousVote = isAnon;
		vr.anonId = anonId;
		vr.usedWeight = requested;
		vr.status = finalize ? VoteStatus.Confirmed : VoteStatus.Pending;

		if (finalize) {
			_applyToTotals(s, vr, true);
			emit VoteCast(sessionId, voter, anonId, requested);
		} else {
			emit VotePrepared(sessionId, voter, anonId, requested);
		}
	}

	function _storeAllocations(VoteRecord storage vr, Allocation[] memory allocations) internal {
		delete vr.allocations;
		for (uint256 i; i < allocations.length; ) {
			vr.allocations.push(allocations[i]);
			unchecked {
				++i;
			}
		}
	}

	function _clearAllocations(VoteRecord storage vr) internal {
		delete vr.allocations;
	}

	function _applyToTotals(Session storage s, VoteRecord storage vr, bool add) internal {
		address stratAddr = VotingStorage.layout().strategies[s.algorithm];
		if (stratAddr == address(0)) revert StrategyNotSet();
		IVotingStrategy strat = IVotingStrategy(stratAddr);
		Allocation[] memory allocs = _copyAllocations(vr.allocations);
		Option[] memory opts = _copyOptions(s.options);
		uint256[] memory weights = strat.computeWeights(allocs, opts);
		for (uint256 i; i < weights.length; ) {
			if (add) {
				s.optionTotals[i] += weights[i];
			} else {
				s.optionTotals[i] -= weights[i];
			}
			unchecked {
				++i;
			}
		}
	}

	function _copyAllocations(Allocation[] storage allocations) internal view returns (Allocation[] memory out) {
		out = new Allocation[](allocations.length);
		for (uint256 i; i < allocations.length; ) {
			out[i] = allocations[i];
			unchecked {
				++i;
			}
		}
	}

	function _copyOptions(Option[] storage options_) internal view returns (Option[] memory out) {
		out = new Option[](options_.length);
		for (uint256 i; i < options_.length; ) {
			out[i] = options_[i];
			unchecked {
				++i;
			}
		}
	}
}
