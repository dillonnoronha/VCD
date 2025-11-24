// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Algorithm, VoteStatus, Option, Allocation, VoteRecord, VoterState, Session} from "../../voting/Types.sol";

library VotingStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("voting.storage.slot");

    struct Layout {
        address owner;
        uint256 nextSessionId;
        mapping(Algorithm => address) strategies;
        mapping(uint256 => Session) sessions;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
