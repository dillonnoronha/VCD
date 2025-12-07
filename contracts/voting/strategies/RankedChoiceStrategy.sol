// SPDX-License-Identifier: MIT
/* istanbul ignore file */
pragma solidity ^0.8.28;

import {Allocation, Option} from "../Types.sol";
import {IVotingStrategy} from "./IVotingStrategy.sol";

/// @dev Minimal ranked-choice style: higher-weight allocation counts more; ignores option base weight.
/// This is a placeholder to prevent StrategyNotSet; real ranked choice would need ballots + rounds.
contract RankedChoiceStrategy is IVotingStrategy {
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
