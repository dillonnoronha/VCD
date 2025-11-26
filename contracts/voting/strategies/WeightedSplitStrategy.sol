// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Allocation, Option} from "../Types.sol";
import {IVotingStrategy} from "./IVotingStrategy.sol";

/**
 * @dev Default weighted split: each allocation weight is multiplied by option weight.
 */
contract WeightedSplitStrategy is IVotingStrategy {
	function computeWeights(Allocation[] calldata allocations, Option[] calldata options)
		external
		pure
		returns (uint256[] memory weights)
	{
		weights = new uint256[](options.length);
		for (uint256 i; i < allocations.length; ) {
			Allocation calldata alloc = allocations[i];
			weights[alloc.optionId] += alloc.weight * options[alloc.optionId].weight;
			unchecked {
				++i;
			}
		}
	}
}
