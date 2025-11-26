// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Allocation, Option} from "../Types.sol";

interface IVotingStrategy {
	function computeWeights(Allocation[] calldata allocations, Option[] calldata options)
		external
		pure
		returns (uint256[] memory weights);
}
