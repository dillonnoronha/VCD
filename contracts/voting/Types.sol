// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

enum Algorithm {
	OnePersonOneVote,
	WeightedSplit
}

enum VoteStatus {
	None,
	Pending,
	Confirmed
}

struct Option {
	string name;
	uint256 weight;
}

struct Allocation {
	uint256 optionId;
	uint256 weight;
}

struct VoteRecord {
	VoteStatus status;
	bool anonymousVote;
	bytes32 anonId;
	uint256 usedWeight;
	Allocation[] allocations;
}

struct VoterState {
	uint256 baseWeight;
	uint256 purchasedWeight;
	uint256 receivedDelegatedWeight;
	bool delegated;
	address delegate;
	bool listed;
	bool exists;
}

struct AnonMeta {
	VoteStatus status;
	uint256 usedWeight;
}

struct Session {
	string name;
	uint256 startTime;
	uint256 endTime;
	uint256 revealTime;
	Algorithm algorithm;
	bool allowAnonymous;
	bool allowMultiVoteWithEth;
	bool concealResults;
	bool revealed;
	bool endedEventEmitted;
	uint256 pricePerWeight;
	uint256 defaultBaseWeight;
	Option[] options;
	address[] voterList;
	mapping(address => bool) authorizedViewers;
	mapping(address => VoterState) voterStates;
	mapping(address => VoteRecord) votes;
	mapping(uint256 => uint256) optionTotals;
}
