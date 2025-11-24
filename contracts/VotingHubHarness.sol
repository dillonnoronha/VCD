// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Session} from "./voting/Types.sol";
import {VotingHub} from "./VotingHub.sol";

contract VotingHubHarness is VotingHub {
	function exposeDistribute(uint256 sessionId, uint256 addedWeight) external {
		Session storage s = _session(sessionId);
		_distributeExtraWeight(s, s.votes[msg.sender], addedWeight);
	}
}
