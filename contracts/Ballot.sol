// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.21;

/// @title Voting with delegation + batch assignment + tie detection
contract Ballot {
    struct Voter {
        uint256 weight;    // weight is accumulated by delegation
        bool voted;        // if true, that person already voted
        address delegate;  // person delegated to
        uint256 vote;      // index of the voted proposal
    }

    struct Proposal {
        bytes32 name;      // short name (up to 32 bytes)
        uint256 voteCount; // number of accumulated votes
    }

    address public chairperson;
    mapping(address => Voter) public voters;
    Proposal[] public proposals;

    // -------- Modifiers --------
    modifier onlyChairperson() {
        require(msg.sender == chairperson, "Only chairperson");
        _;
    }

    /// Create a new ballot to choose one of `proposalNames`.
    constructor(bytes32[] memory proposalNames) {
        require(proposalNames.length > 0, "Need at least one proposal");
        chairperson = msg.sender;
        voters[chairperson].weight = 1;

        for (uint256 i = 0; i < proposalNames.length; i++) {
            proposals.push(
                Proposal({
                    name: proposalNames[i],
                    voteCount: 0
                })
            );
        }
    }

    // -------- Voting rights --------

    /// Internal helper to give a single voter the right to vote.
    function _giveRightToVote(address voter) internal {
        require(!voters[voter].voted, "The voter already voted.");
        require(voters[voter].weight == 0, "Voter already has right.");
        voters[voter].weight = 1;
    }

    /// Give `voter` the right to vote on this ballot.
    /// May only be called by `chairperson`.
    function giveRightToVote(address voter) external onlyChairperson {
        _giveRightToVote(voter);
    }

    /// Batch version: give multiple voters the right to vote in a single tx.
    /// Addresses that already have rights or have voted are skipped.
    function giveRightToVoteBatch(address[] calldata voterAddresses)
        external
        onlyChairperson
    {
        for (uint256 i = 0; i < voterAddresses.length; i++) {
            address voter = voterAddresses[i];

            // Only attempt if they currently have no weight and have not voted
            if (!voters[voter].voted && voters[voter].weight == 0) {
                _giveRightToVote(voter);
            }
        }
    }

    // -------- Delegation --------

    /// Delegate your vote to the voter `to`.
    function delegate(address to) external {
        Voter storage sender = voters[msg.sender];
        require(sender.weight != 0, "You have no right to vote");
        require(!sender.voted, "You already voted.");
        require(to != msg.sender, "Self-delegation disallowed.");

        // Forward the delegation as long as `to` has delegated.
        while (voters[to].delegate != address(0)) {
            to = voters[to].delegate;

            // We found a loop in the delegation, not allowed.
            require(to != msg.sender, "Found loop in delegation.");
        }

        Voter storage delegate_ = voters[to];
        require(delegate_.weight >= 1, "Delegate has no right to vote");

        sender.voted = true;
        sender.delegate = to;

        if (delegate_.voted) {
            proposals[delegate_.vote].voteCount += sender.weight;
        } else {
            delegate_.weight += sender.weight;
        }
    }

    // -------- Voting --------

    /// Give your vote (including votes delegated to you)
    /// to proposal `proposal`.
    function vote(uint256 proposal) external {
        Voter storage sender = voters[msg.sender];
        require(sender.weight != 0, "Has no right to vote");
        require(!sender.voted, "Already voted.");
        require(proposal < proposals.length, "Invalid proposal index");

        sender.voted = true;
        sender.vote = proposal;
        proposals[proposal].voteCount += sender.weight;
    }

    // -------- Result calculation --------

    /// Original behavior: returns a single winning proposal index
    /// (the first one with the highest voteCount).
    function winningProposal() public view returns (uint256 winningProposal_) {
        uint256 winningVoteCount = 0;
        for (uint256 p = 0; p < proposals.length; p++) {
            if (proposals[p].voteCount > winningVoteCount) {
                winningVoteCount = proposals[p].voteCount;
                winningProposal_ = p;
            }
        }
    }

    /// Returns the name of the single winner (kept for compatibility).
    function winnerName() external view returns (bytes32 winnerName_) {
        winnerName_ = proposals[winningProposal()].name;
    }

    /// New: returns all proposal indices that share the highest vote count.
    function winningProposals()
        public
        view
        returns (uint256[] memory winnerIndices, uint256 winningVoteCount)
    {
        // 1) Find max vote count
        for (uint256 p = 0; p < proposals.length; p++) {
            if (proposals[p].voteCount > winningVoteCount) {
                winningVoteCount = proposals[p].voteCount;
            }
        }

        // 2) Count how many proposals have that max count
        uint256 count = 0;
        for (uint256 p = 0; p < proposals.length; p++) {
            if (proposals[p].voteCount == winningVoteCount) {
                count++;
            }
        }

        // 3) Fill array with all winner indices
        winnerIndices = new uint256[](count);
        uint256 idx = 0;
        for (uint256 p = 0; p < proposals.length; p++) {
            if (proposals[p].voteCount == winningVoteCount) {
                winnerIndices[idx] = p;
                idx++;
            }
        }
    }

    /// Convenience: returns true if there is a tie between 2+ proposals.
    function isTie() external view returns (bool) {
        (, uint256 winningVoteCount) = winningProposals();

        if (winningVoteCount == 0) {
            // If nobody voted, treat as "no tie" (define differently if you want)
            return false;
        }

        uint256 count = 0;
        for (uint256 p = 0; p < proposals.length; p++) {
            if (proposals[p].voteCount == winningVoteCount) {
                count++;
                if (count > 1) {
                    return true;
                }
            }
        }
        return false;
    }
}
