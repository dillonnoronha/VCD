// SPDX-License-Identifier: MIT
// @custom:coverage ignore-file
pragma solidity ^0.8.28;

import {VotingHubInterface} from "./VotingHubInterface.sol";

contract ReenterPurchaser {
	VotingHubInterface public hub;
	uint256 public sessionId;

	constructor(address _hub, uint256 _sessionId) {
		hub = VotingHubInterface(_hub);
		sessionId = _sessionId;
	}

	receive() external payable {
		hub.purchaseWeight{value: msg.value}(sessionId);
	}

	function attack() external payable {
		hub.purchaseWeight{value: msg.value}(sessionId);
	}
}
