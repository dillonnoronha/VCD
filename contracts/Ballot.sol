// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Ballot {
    struct Voter {
        uint weight;
        bool voted;
        address delegate;
        uint vote;
    }

    struct Proposal {
        bytes32 name;
        uint voteCount;
    }

    event VoteCast(address indexed voter, uint indexed proposal, uint weight);
    event RightGiven(address indexed chairperson, address indexed voter);
    event Delegated(address indexed from, address indexed to);

    address public chairperson;
    uint public deadline;

    mapping(address => Voter) public voters;
    Proposal[] public proposals;

    constructor(bytes32[] memory proposalNames, uint _durationSeconds) {
        chairperson = msg.sender;
        voters[chairperson].weight = 1;

        deadline = block.timestamp + _durationSeconds;

        for (uint i = 0; i < proposalNames.length; i++) {
            proposals.push(Proposal({name: proposalNames[i], voteCount: 0}));
        }
    }

    modifier onlyChair() {
        require(msg.sender == chairperson, "Not chairperson");
        _;
    }

    modifier votingActive() {
        require(block.timestamp < deadline, "Voting period has ended");
        _;
    }

    function _giveRightToVote(address voter) internal {
        require(!voters[voter].voted, "Already voted");
        require(voters[voter].weight == 0, "Already has right");

        voters[voter].weight = 1;

        emit RightGiven(chairperson, voter);
    }

    function giveRightToVote(address voter) external onlyChair {
        _giveRightToVote(voter);
    }

    function giveRightToMany(address[] calldata voterAddrs) external onlyChair {
        for (uint i = 0; i < voterAddrs.length; i++) {
            _giveRightToVote(voterAddrs[i]);
        }
    }

    function delegate(address to) external votingActive {
        Voter storage sender = voters[msg.sender];

        require(sender.weight > 0, "No right to vote");
        require(!sender.voted, "Already voted");
        require(to != msg.sender, "Self-delegation disallowed");

        while (voters[to].delegate != address(0)) {
            to = voters[to].delegate;
            require(to != msg.sender, "Found delegation loop");
        }

        Voter storage delegate_ = voters[to];

        require(delegate_.weight >= 1, "Delegate has no right");

        sender.voted = true;
        sender.delegate = to;

        emit Delegated(msg.sender, to);

        if (delegate_.voted) {
            proposals[delegate_.vote].voteCount += sender.weight;
        } else {
            delegate_.weight += sender.weight;
        }
    }

    function vote(uint proposal) external votingActive {
        Voter storage sender = voters[msg.sender];

        require(sender.weight > 0, "No right to vote");
        require(!sender.voted, "Already voted");
        require(proposal < proposals.length, "Invalid proposal");

        sender.voted = true;
        sender.vote = proposal;
        proposals[proposal].voteCount += sender.weight;

        emit VoteCast(msg.sender, proposal, sender.weight);
    }

    function hasEnded() external view returns (bool) {
        return block.timestamp >= deadline;
    }

    function getWinners() public view returns (uint[] memory) {
        uint winningVoteCount = 0;
        uint numWinners = 0;

        for (uint p = 0; p < proposals.length; p++) {
            uint vc = proposals[p].voteCount;
            if (vc > winningVoteCount) {
                winningVoteCount = vc;
                numWinners = 1;
            } else if (vc == winningVoteCount && vc > 0) {
                numWinners += 1;
            }
        }

        if (winningVoteCount == 0) {
            return new uint[](0);
        }

        uint[] memory winners = new uint[](numWinners);
        uint idx = 0;
        for (uint p = 0; p < proposals.length; p++) {
            if (proposals[p].voteCount == winningVoteCount) {
                winners[idx] = p;
                idx++;
            }
        }

        return winners;
    }

    function winningProposal() public view returns (uint winner) {
        uint[] memory winners = getWinners();
        if (winners.length == 0) {
            return 0;
        }
        return winners[0];
    }

    function winnerName() external view returns (bytes32) {
        uint[] memory winners = getWinners();
        if (winners.length == 0) {
            return proposals[0].name;
        }
        return proposals[winners[0]].name;
    }
}
