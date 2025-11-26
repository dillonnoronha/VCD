// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VotingStorage} from "../lib/VotingStorage.sol";
import {VotingErrors} from "../../voting/Errors.sol";
import {Session} from "../../voting/Types.sol";

contract RevealFacet is VotingErrors {
	using VotingStorage for VotingStorage.Layout;
	event SessionEnded(uint256 indexed sessionId);
	event ResultsRevealed(uint256 indexed sessionId, uint256 timestamp);

	modifier onlyOwner() {
		if (msg.sender != VotingStorage.layout().owner) revert NotOwner();
		_;
	}

	function setAuthorizedViewer(uint256 sessionId, address viewer, bool allowed) external onlyOwner {
		Session storage s = _session(sessionId);
		if (s.authorizedViewers[viewer] == allowed) return;
		s.authorizedViewers[viewer] = allowed;
	}

	function revealResults(uint256 sessionId) external {
		Session storage s = _session(sessionId);
		if (!s.concealResults) revert AlreadyPublic();
		if (!_isAuthorizedViewer(s, msg.sender) && msg.sender != VotingStorage.layout().owner) revert NotAuthorized();
		s.revealed = true;
		emit ResultsRevealed(sessionId, block.timestamp);
	}

	function emitSessionEnd(uint256 sessionId) external {
		Session storage s = _session(sessionId);
		if (block.timestamp < s.endTime) revert Inactive();
		if (s.endedEventEmitted) revert AlreadyEmitted();
		s.endedEventEmitted = true;
		emit SessionEnded(sessionId);
	}

	function _session(uint256 sessionId) internal view returns (Session storage s) {
		s = VotingStorage.layout().sessions[sessionId];
		if (s.endTime == 0) revert SessionMissing();
	}

	function _isAuthorizedViewer(Session storage s, address viewer) internal view returns (bool) {
		return s.authorizedViewers[viewer];
	}
}
