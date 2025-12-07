// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VotingStorage} from "../lib/VotingStorage.sol";
import {VotingErrors} from "../../voting/Errors.sol";
import {VoteRecord, VoterState, Session, VoteStatus, Option} from "../../voting/Types.sol";

	contract DelegationFacet is VotingErrors {
		using VotingStorage for VotingStorage.Layout;

	event VoteDelegated(uint256 indexed sessionId, address indexed from, address indexed to, uint256 weight);

		function delegateVote(uint256 sessionId, address to) external {
			Session storage s = _session(sessionId);
			if (!_isActive(s)) revert Inactive();
			if (to == msg.sender) revert SelfDelegation();
			VoteRecord storage vr = s.votes[msg.sender];
		if (vr.status != VoteStatus.None) revert AlreadyVoted();

		VoterState storage fromState = _ensureState(s, msg.sender);
		if (fromState.delegated) revert Delegated();

		address cursor = to;
		while (s.voterStates[cursor].delegate != address(0)) {
			cursor = s.voterStates[cursor].delegate;
			if (cursor == msg.sender) revert DelegationLoop();
		}

		VoterState storage toState = _ensureState(s, to);
			uint256 transferable = _availableWeight(fromState);
			if (transferable == 0) revert NoWeight();

			fromState.delegated = true;
			fromState.delegate = to;
			fromState.baseWeight = 0;
			fromState.purchasedWeight = 0;

			if (s.votes[to].status == VoteStatus.Confirmed) {
				_applyExtraToConfirmed(s, s.votes[to], transferable);
			} else {
				toState.baseWeight += transferable;
			}
			toState.receivedDelegatedWeight += transferable;

			emit VoteDelegated(sessionId, msg.sender, to, transferable);
		}

		function _applyExtraToConfirmed(Session storage s, VoteRecord storage vr, uint256 addedWeight) internal {
			uint256 remaining = addedWeight;
		for (uint256 i; i < vr.allocations.length; ) {
			uint256 extra = (addedWeight * vr.allocations[i].weight) / vr.usedWeight;
			if (i == vr.allocations.length - 1) extra = remaining;
			vr.allocations[i].weight += extra;
			s.optionTotals[vr.allocations[i].optionId] += extra * s.options[vr.allocations[i].optionId].weight;
			remaining -= extra;
			unchecked {
				++i;
			}
		}
		vr.usedWeight += addedWeight;
	}

	function _session(uint256 sessionId) internal view returns (Session storage s) {
		s = VotingStorage.layout().sessions[sessionId];
		if (s.endTime == 0) revert SessionMissing();
	}

	function _isActive(Session storage s) internal view returns (bool) {
		return block.timestamp >= s.startTime && block.timestamp < s.endTime;
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

	function _availableWeight(VoterState storage st) internal view returns (uint256) {
		uint256 base = st.exists ? st.baseWeight : 1;
		return base + st.purchasedWeight;
	}
}
