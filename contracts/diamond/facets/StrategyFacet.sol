// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VotingStorage} from "../lib/VotingStorage.sol";
import {VotingErrors} from "../../voting/Errors.sol";
import {Algorithm} from "../../voting/Types.sol";

contract StrategyFacet is VotingErrors {
	using VotingStorage for VotingStorage.Layout;

	modifier onlyOwner() {
		if (msg.sender != VotingStorage.layout().owner) revert NotOwner();
		_;
	}

	function setStrategy(Algorithm algorithm, address strategy) external onlyOwner {
		if (strategy == address(0)) revert StrategyNotSet();
		VotingStorage.layout().strategies[algorithm] = strategy;
	}

	function clearStrategy(Algorithm algorithm) external onlyOwner {
		delete VotingStorage.layout().strategies[algorithm];
	}
}
