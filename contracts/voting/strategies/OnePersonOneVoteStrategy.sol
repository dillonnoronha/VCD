// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Allocation, Option} from "../Types.sol";
import {IVotingStrategy} from "./IVotingStrategy.sol";

/// @dev Simple strategy: weight per allocation = provided weight (ignores option weight).
contract OnePersonOneVoteStrategy is IVotingStrategy {
    function computeWeights(Allocation[] calldata allocations, Option[] calldata options)
        external
        pure
        returns (uint256[] memory weights)
    {
        weights = new uint256[](options.length);
        for (uint256 i; i < allocations.length; ) {
            Allocation calldata alloc = allocations[i];
            weights[alloc.optionId] += alloc.weight;
            unchecked { ++i; }
        }
    }
}
