// SPDX-License-Identifier: MIT
/* istanbul ignore file */
pragma solidity ^0.8.28;

/// @notice Minimal ERC165-like responder to stop unknown-selector spam from tools/wallets.
contract IntrospectionFacet {
	function supportsInterface(bytes4) external pure returns (bool) {
		return false;
	}
}
