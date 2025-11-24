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
		uint256 pricePerWeight
	) external onlyOwner returns (uint256 id) {
		if (optionNames.length == 0) revert OptionsRequired();
		if (optionNames.length != optionWeights.length) revert OptionMismatch();
		if (startTime >= endTime) revert InvalidWindow();

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

	function getOptionTotals(uint256 sessionId) external view returns (uint256[] memory totals) {
		Session storage s = _session(sessionId);
		if (!_canSeeResults(s, msg.sender)) revert NotAuthorized();
		totals = new uint256[](s.options.length);
		for (uint256 i; i < s.options.length; ) {
			totals[i] = s.optionTotals[i];
			unchecked {
				++i;
			}
		}
	}

	function getWinners(uint256 sessionId) external view returns (uint256[] memory winners) {
		Session storage s = _session(sessionId);
		if (!_canSeeResults(s, msg.sender)) revert NotAuthorized();
		uint256 best;
		for (uint256 i; i < s.options.length; ) {
			uint256 val = s.optionTotals[i];
			if (val > best) best = val;
			unchecked {
				++i;
			}
		}
		uint256 count;
		for (uint256 j; j < s.options.length; ) {
			if (s.optionTotals[j] == best) count++;
			unchecked {
				++j;
			}
		}
		winners = new uint256[](count);
		uint256 idx;
		for (uint256 k; k < s.options.length; ) {
			if (s.optionTotals[k] == best) {
				winners[idx++] = k;
			}
			unchecked {
				++k;
			}
		}
	}

	function getOptions(uint256 sessionId) external view returns (Option[] memory opts) {
		Session storage s = _session(sessionId);
		opts = new Option[](s.options.length);
		for (uint256 i; i < s.options.length; ) {
			opts[i] = s.options[i];
			unchecked {
				++i;
			}
		}
	}

	function getVoteAllocations(uint256 sessionId, address voter)
		external
		view
		returns (VoteStatus status, Allocation[] memory allocations, bool anonymousVote, bytes32 anonId, uint256 usedWeight)
	{
		Session storage s = _session(sessionId);
		if (!_isAuthorizedViewer(s, msg.sender) && msg.sender != voter && msg.sender != VotingStorage.layout().owner) {
			revert NotAuthorized();
		}
		VoteRecord storage vr = s.votes[voter];
		status = vr.status;
		anonymousVote = vr.anonymousVote;
		anonId = vr.anonId;
		usedWeight = vr.usedWeight;
		allocations = new Allocation[](vr.allocations.length);
		for (uint256 i; i < vr.allocations.length; ) {
			allocations[i] = vr.allocations[i];
			unchecked {
				++i;
			}
		}
	}

	function canSeeResults(uint256 sessionId, address viewer) external view returns (bool) {
		Session storage s = _session(sessionId);
		return _canSeeResults(s, viewer);
	}

	// internal helpers
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

	function _session(uint256 sessionId) internal view returns (Session storage s) {
		s = VotingStorage.layout().sessions[sessionId];
		if (s.endTime == 0) revert SessionMissing();
	}

	function _isActive(Session storage s) internal view returns (bool) {
		return block.timestamp >= s.startTime && block.timestamp < s.endTime;
	}

	function _availableWeight(VoterState storage st) internal view returns (uint256) {
		uint256 base = st.exists ? st.baseWeight : 1;
		return base + st.purchasedWeight;
	}

	function _ensureState(Session storage s, address voter) internal returns (VoterState storage) {
		VoterState storage st = s.voterStates[voter];
		if (!st.exists) {
			st.exists = true;
			st.baseWeight = 1;
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

	function _canSeeResults(Session storage s, address viewer) internal view returns (bool) {
		if (!s.concealResults) return true;
		if (s.revealed) return true;
		if (block.timestamp >= s.revealTime) return true;
		if (!_isActive(s)) return true;
		return _isAuthorizedViewer(s, viewer) || viewer == VotingStorage.layout().owner;
	}

	function _isAuthorizedViewer(Session storage s, address viewer) internal view returns (bool) {
		return s.authorizedViewers[viewer];
	}
}
