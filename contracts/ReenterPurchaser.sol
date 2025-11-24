// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VotingHub} from "./VotingHub.sol";

contract ReenterPurchaser {
	VotingHub public hub;
	uint256 public sessionId;

	constructor(address _hub, uint256 _sessionId) {
		hub = VotingHub(_hub);
		sessionId = _sessionId;
	}

	receive() external payable {
		hub.purchaseWeight{value: msg.value}(sessionId);
	}

	function attack() external payable {
		hub.purchaseWeight{value: msg.value}(sessionId);
	}
}
