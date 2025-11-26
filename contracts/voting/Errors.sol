// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

abstract contract VotingErrors {
	error NotOwner();
	error OptionsRequired();
	error OptionMismatch();
	error InvalidWindow();
	error Inactive();
	error Delegated();
	error BadOption();
	error BadWeight();
	error AnonDisabled();
	error AnonIdRequired();
	error NotAuthorized();
	error AlreadyPublic();
	error AlreadyEmitted();
	error SelfDelegation();
	error AlreadyVoted();
	error DelegationLoop();
	error NoWeight();
	error ValueTooLow();
	error PriceUnset();
	error PurchasesOff();
	error NothingPending();
	error NoVote();
	error NoConfirmedVote();
	error Reentrancy();
	error StrategyNotSet();
	error ZeroOwner();
	error SessionMissing();
	error RefundFailed();
}
