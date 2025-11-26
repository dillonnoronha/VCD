// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VotingStorage} from "../lib/VotingStorage.sol";
import {VotingErrors} from "../../voting/Errors.sol";
import {VoteRecord, VoterState, Session, VoteStatus} from "../../voting/Types.sol";

contract PurchaseFacet is VotingErrors {
	using VotingStorage for VotingStorage.Layout;

	event AdditionalWeightPurchased(uint256 indexed sessionId, address indexed buyer, uint256 weight, uint256 valuePaid);

	function purchaseWeight(uint256 sessionId) external payable {
		Session storage s = _session(sessionId);
		if (!_isActive(s)) revert Inactive();
		if (!s.allowMultiVoteWithEth) revert PurchasesOff();
		if (s.pricePerWeight == 0) revert PriceUnset();
		uint256 units = msg.value / s.pricePerWeight;
		if (units == 0) revert ValueTooLow();

		VoterState storage st = _ensureState(s, msg.sender);
		st.purchasedWeight += units;

		if (s.votes[msg.sender].status == VoteStatus.Confirmed) {
			_applyExtraToConfirmed(s, s.votes[msg.sender], units);
		}

		uint256 refund = msg.value - (units * s.pricePerWeight);
		if (refund > 0) {
			(bool ok, ) = msg.sender.call{value: refund}("");
			if (!ok) revert RefundFailed();
		}

		emit AdditionalWeightPurchased(sessionId, msg.sender, units, msg.value - refund);
	}

	function _applyExtraToConfirmed(Session storage s, VoteRecord storage vr, uint256 addedWeight) internal {
		if (addedWeight == 0 || vr.usedWeight == 0) return;
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
			st.baseWeight = 1;
		}
		return st;
	}
}
