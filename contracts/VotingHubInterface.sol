// SPDX-License-Identifier: MIT
// @custom:coverage ignore-file
pragma solidity ^0.8.28;

import {Algorithm, Allocation, Option, VoteStatus} from "./voting/Types.sol";

interface VotingHubInterface {
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

	event SessionCreated(uint256 indexed sessionId, string name, uint256 startTime, uint256 endTime);
	event VotePrepared(uint256 indexed sessionId, address indexed voter, bytes32 anonId, uint256 weight);
	event VoteCast(uint256 indexed sessionId, address indexed voter, bytes32 anonId, uint256 weight);
	event VoteUpdated(uint256 indexed sessionId, address indexed voter, bytes32 anonId, uint256 weight);
	event VoteRevoked(uint256 indexed sessionId, address indexed voter, bytes32 anonId);
	event VoteDelegated(uint256 indexed sessionId, address indexed from, address indexed to, uint256 weight);
	event SessionEnded(uint256 indexed sessionId);
	event ResultsRevealed(uint256 indexed sessionId, uint256 timestamp);
	event AdditionalWeightPurchased(uint256 indexed sessionId, address indexed buyer, uint256 weight, uint256 valuePaid);

	function owner() external view returns (address);
	function transferOwnership(address newOwner) external;
	function nextSessionId() external view returns (uint256);
	function setVoterWeight(uint256 sessionId, address voter, uint256 weight) external;
	function setAuthorizedViewer(uint256 sessionId, address viewer, bool allowed) external;
	function setStrategy(Algorithm algorithm, address strategy) external;
	function clearStrategy(Algorithm algorithm) external;
	function createSession(
		string memory name,
		string[] memory optionNames,
		uint256[] memory optionWeights,
		uint256 startTime,
		uint256 endTime,
		uint256 revealTime,
		Algorithm algorithm,
		bool allowAnonymous,
		bool allowMultiVoteWithEth,
		bool concealResults,
		address[] memory authorizedViewers,
		uint256 pricePerWeight,
		uint256 defaultBaseWeight
	) external returns (uint256 id);
	function castVote(uint256 sessionId, Allocation[] memory allocations, bool finalize) external;
	function castAnonymousVote(uint256 sessionId, bytes32 anonId, Allocation[] memory allocations, bool finalize) external;
	function confirmVote(uint256 sessionId) external;
	function revokeVote(uint256 sessionId) external;
	function updateVote(uint256 sessionId, Allocation[] memory allocations, bool finalize) external;
	function delegateVote(uint256 sessionId, address to) external;
	function purchaseWeight(uint256 sessionId) external payable;
	function revealResults(uint256 sessionId) external;
	function emitSessionEnd(uint256 sessionId) external;
	function forceEndSession(uint256 sessionId) external;
	function getOptionTotals(uint256 sessionId) external view returns (uint256[] memory totals);
	function getWinners(uint256 sessionId) external view returns (uint256[] memory winners);
	function getOptions(uint256 sessionId) external view returns (Option[] memory opts);
	function getVoteAllocations(uint256 sessionId, address voter)
		external
		view
		returns (VoteStatus status, Allocation[] memory allocations, bool anonymousVote, bytes32 anonId, uint256 usedWeight);
    function listVoters(uint256 sessionId) external view returns (address[] memory voters);
	function canSeeResults(uint256 sessionId, address viewer) external view returns (bool);
	function getVoterState(uint256 sessionId, address voter)
		external
		view
		returns (
			uint256 baseWeight,
			uint256 purchasedWeight,
			address delegate,
			bool delegated,
			uint256 availableWeight,
			uint256 receivedDelegatedWeight
		);
	function getSessionMeta(uint256 sessionId)
		external
		view
		returns (
			string memory name,
			uint256 startTime,
			uint256 endTime,
			uint256 revealTime,
			Algorithm algorithm,
			bool allowAnonymous,
			bool allowMultiVoteWithEth,
			bool concealResults,
			bool revealed,
			uint256 optionCount,
			uint256 pricePerWeight,
			uint256 defaultBaseWeight
		);
	function listSessions() external view returns (uint256[] memory ids);
	function listDelegators(uint256 sessionId, address delegatee) external view returns (address[] memory voters);
}
