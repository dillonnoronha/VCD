// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VotingStorage} from "../lib/VotingStorage.sol";
import {VotingErrors} from "../../voting/Errors.sol";
import {Session, VoterState} from "../../voting/Types.sol";

contract AdminFacet is VotingErrors {
	using VotingStorage for VotingStorage.Layout;

	modifier onlyOwner() {
		if (msg.sender != VotingStorage.layout().owner) revert NotOwner();
		_;
	}

	function owner() external view returns (address) {
		return VotingStorage.layout().owner;
	}

	function nextSessionId() external view returns (uint256) {
		return VotingStorage.layout().nextSessionId;
	}

	function transferOwnership(address newOwner) external onlyOwner {
		if (newOwner == address(0)) revert ZeroOwner();
		VotingStorage.layout().owner = newOwner;
	}

	function setVoterWeight(uint256 sessionId, address voter, uint256 weight) external onlyOwner {
		Session storage s = _session(sessionId);
		VoterState storage st = _ensureState(s, voter);
		st.baseWeight = weight;
	}

	function _session(uint256 sessionId) internal view returns (Session storage s) {
		s = VotingStorage.layout().sessions[sessionId];
		if (s.endTime == 0) revert SessionMissing();
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
