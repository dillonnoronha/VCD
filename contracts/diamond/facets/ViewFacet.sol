// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VotingStorage} from "../lib/VotingStorage.sol";
import {VotingErrors} from "../../voting/Errors.sol";
import {Algorithm, Option, Allocation, VoteStatus, Session, VoteRecord, VoterState} from "../../voting/Types.sol";
import {IVotingStrategy} from "../../voting/strategies/IVotingStrategy.sol";

/// @notice Read-only view helpers split from CoreFacet to reduce code size.
contract ViewFacet is VotingErrors {
	using VotingStorage for VotingStorage.Layout;

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
		uint256 highest;
		for (uint256 i; i < s.options.length; ) {
			if (s.optionTotals[i] > highest) highest = s.optionTotals[i];
			unchecked {
				++i;
			}
		}
		uint256 count;
		for (uint256 i; i < s.options.length; ) {
			if (s.optionTotals[i] == highest) {
				count++;
			}
			unchecked {
				++i;
			}
		}
		winners = new uint256[](count);
		uint256 idx;
		for (uint256 i; i < s.options.length; ) {
			if (s.optionTotals[i] == highest) {
				winners[idx++] = i;
			}
			unchecked {
				++i;
			}
		}
	}

	function getOptions(uint256 sessionId) external view returns (Option[] memory opts) {
		Session storage s = _session(sessionId);
		opts = _copyOptions(s.options);
	}

	function getVoteAllocations(uint256 sessionId, address voter)
		external
		view
		returns (VoteStatus status, Allocation[] memory allocations, bool anonymousVote, bytes32 anonId, uint256 usedWeight)
	{
		Session storage s = _session(sessionId);
		bool self = msg.sender == voter;
		if (!self && !_canSeeResults(s, msg.sender)) revert NotAuthorized();
		VoteRecord storage vr = s.votes[voter];
		status = vr.status;
		anonymousVote = vr.anonymousVote;
		if (anonymousVote && !self) {
			anonId = bytes32(0);
			usedWeight = 0;
			allocations = new Allocation[](0);
		} else {
			anonId = vr.anonId;
			usedWeight = vr.usedWeight;
			allocations = _copyAllocations(vr.allocations);
		}
	}

	function canSeeResults(uint256 sessionId, address viewer) external view returns (bool) {
		return _canSeeResults(_session(sessionId), viewer);
	}

	function getVoterState(uint256 sessionId, address voter)
		external
		view
		returns (
			uint256 baseWeight,
			uint256 purchasedWeight,
			address delegate,
			bool delegated,
			uint256 availableWeight,
			uint256 receivedDelegatedWeight
		) {
		Session storage s = _session(sessionId);
		VoterState storage st = s.voterStates[voter];
		uint256 base = st.exists ? st.baseWeight : s.defaultBaseWeight == 0 ? 1 : s.defaultBaseWeight;
		baseWeight = base;
		purchasedWeight = st.purchasedWeight;
		delegate = st.delegate;
		delegated = st.delegated;
		receivedDelegatedWeight = st.receivedDelegatedWeight;
		availableWeight = base + st.purchasedWeight + st.receivedDelegatedWeight;
	}

	function getSessionMeta(uint256 sessionId)
		external
		view
		returns (
			string memory name,
			uint256 startTime,
			uint256 endTime,
			uint256 revealTime,
			Algorithm algorithm,
			bool allowAnonymous,
			bool allowMultiVoteWithEth,
			bool concealResults,
			bool revealed,
			uint256 optionCount,
			uint256 pricePerWeight,
			uint256 defaultBaseWeight
		)
	{
		Session storage s = _session(sessionId);
		name = s.name;
		startTime = s.startTime;
		endTime = s.endTime;
		revealTime = s.revealTime;
		algorithm = s.algorithm;
		allowAnonymous = s.allowAnonymous;
		allowMultiVoteWithEth = s.allowMultiVoteWithEth;
		concealResults = s.concealResults;
		revealed = s.revealed;
		optionCount = s.options.length;
		pricePerWeight = s.pricePerWeight;
		defaultBaseWeight = s.defaultBaseWeight == 0 ? 1 : s.defaultBaseWeight;
	}

	function listSessions() external view returns (uint256[] memory ids) {
		ids = VotingStorage.layout().sessionIds;
	}

	function listVoters(uint256 sessionId) external view returns (address[] memory voters) {
		Session storage s = _session(sessionId);
		if (!_canSeeResults(s, msg.sender)) revert NotAuthorized();

		// collect only voters with an active vote, mask anon as address(0), dedupe
		address[] memory tmp = new address[](s.voterList.length);
		uint256 count;
		for (uint256 i; i < s.voterList.length; ) {
			address v = s.voterList[i];
			VoteRecord storage vr = s.votes[v];
			if (vr.status != VoteStatus.None) {
				address out = vr.anonymousVote ? address(0) : v;
				bool seen;
				for (uint256 j; j < count; ) {
					if (tmp[j] == out) {
						seen = true;
						break;
					}
					unchecked {
						++j;
					}
				}
				if (!seen) {
					tmp[count++] = out;
				}
			}
			unchecked {
				++i;
			}
		}
		voters = new address[](count);
		for (uint256 k; k < count; ) {
			voters[k] = tmp[k];
			unchecked {
				++k;
			}
		}
	}

	function listDelegators(uint256 sessionId, address delegatee) external view returns (address[] memory delegators) {
		Session storage s = _session(sessionId);
		if (!_canSeeResults(s, msg.sender) && msg.sender != delegatee) revert NotAuthorized();
		uint256 count;
		for (uint256 i; i < s.voterList.length; ) {
			VoterState storage st = s.voterStates[s.voterList[i]];
			if (st.delegated && st.delegate == delegatee) {
				count++;
			}
			unchecked {
				++i;
			}
		}
		delegators = new address[](count);
		uint256 idx;
		for (uint256 i; i < s.voterList.length; ) {
			VoterState storage st = s.voterStates[s.voterList[i]];
			if (st.delegated && st.delegate == delegatee) {
				delegators[idx++] = s.voterList[i];
			}
			unchecked {
				++i;
			}
		}
	}

	// ---------- internal helpers (view only) ----------
	function _session(uint256 sessionId) internal view returns (Session storage s) {
		s = VotingStorage.layout().sessions[sessionId];
		if (s.endTime == 0) revert SessionMissing();
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

	function _isActive(Session storage s) internal view returns (bool) {
		return block.timestamp >= s.startTime && block.timestamp < s.endTime;
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

	function _copyAllocations(Allocation[] storage allocations) internal view returns (Allocation[] memory out) {
		out = new Allocation[](allocations.length);
		for (uint256 i; i < allocations.length; ) {
			out[i] = allocations[i];
			unchecked {
				++i;
			}
		}
	}
}
