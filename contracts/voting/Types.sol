// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

enum Algorithm {
	OnePersonOneVote,
	RankedChoice,
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
	bool delegated;
	address delegate;
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
	Option[] options;
	address creator;
	address[] authorizedList;
	mapping(address => bool) authorizedViewers;
	mapping(address => VoterState) voterStates;
	mapping(address => VoteRecord) votes;
	mapping(bytes32 => AnonMeta) anonVotes;
	mapping(uint256 => uint256) optionTotals;
}
