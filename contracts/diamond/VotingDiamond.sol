// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VotingStorage} from "./lib/VotingStorage.sol";
import {VotingErrors} from "../voting/Errors.sol";

contract VotingDiamond is VotingErrors {
	using VotingStorage for VotingStorage.Layout;

	// selector => facet
	mapping(bytes4 => address) public facets;

	event FacetSet(bytes4 indexed selector, address indexed impl);

	constructor(bytes4[] memory selectors, address[] memory impls, address owner_) {
		require(selectors.length == impls.length, "len mismatch");
		VotingStorage.layout().owner = owner_ == address(0) ? msg.sender : owner_;
		for (uint256 i; i < selectors.length; ) {
			facets[selectors[i]] = impls[i];
			emit FacetSet(selectors[i], impls[i]);
			unchecked {
				++i;
			}
		}
	}

	modifier onlyOwner() {
		if (msg.sender != VotingStorage.layout().owner) revert NotOwner();
		_;
	}

	function setFacet(bytes4 selector, address impl) external onlyOwner {
		facets[selector] = impl;
		emit FacetSet(selector, impl);
	}

	function owner() external view returns (address) {
		return VotingStorage.layout().owner;
	}

	fallback() external payable {
		address impl = facets[msg.sig];
		// If no facet is registered for the selector, return cleanly to avoid noisy reverts
		if (impl == address(0)) {
			assembly {
				return(0, 0)
			}
		}
		assembly {
			calldatacopy(0, 0, calldatasize())
			let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
			let size := returndatasize()
			returndatacopy(0, 0, size)
			switch result
			case 0 { revert(0, size) }
			default { return(0, size) }
		}
	}

	receive() external payable {}
}
