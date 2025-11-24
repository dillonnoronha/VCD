// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title VotingHub
 * @notice Flexible on-chain voting hub supporting multiple concurrent sessions, weighted voting,
 * delegation, anonymous aliases, optional result concealment, and vote lifecycle controls.
 */
contract VotingHub {
	// --- Ownership ---
	address public owner;

	modifier onlyOwner() {
		require(msg.sender == owner, "Not owner");
		_;
	}

	constructor() {
		owner = msg.sender;
	}

	function transferOwnership(address newOwner) external onlyOwner {
		require(newOwner != address(0), "Zero owner");
		owner = newOwner;
	}

	// --- Data structures ---
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
		uint256 weight; // multiplier for the option itself (default 1)
	}

	struct Allocation {
		uint256 optionId;
		uint256 weight; // raw weight from voter assigned to the option
	}

	struct VoteRecord {
		VoteStatus status;
		bool anonymousVote;
		bytes32 anonId;
		uint256 usedWeight;
		Allocation[] allocations;
	}

	struct VoterState {
		uint256 baseWeight; // default or admin-set weight
		uint256 purchasedWeight; // acquired via ETH payments
		bool delegated; // true once voter delegated away their weight
		address delegate;
		bool exists;
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
		mapping(bytes32 => VoteRecord) anonVotes;
		mapping(uint256 => uint256) optionTotals; // aggregated (voter weight * option weight)
	}

	uint256 public nextSessionId;
	mapping(uint256 => Session) private sessions;

	// --- Events ---
	event SessionCreated(uint256 indexed sessionId, string name, uint256 startTime, uint256 endTime);
	event VotePrepared(uint256 indexed sessionId, address indexed voter, bytes32 anonId, uint256 weight);
	event VoteCast(uint256 indexed sessionId, address indexed voter, bytes32 anonId, uint256 weight);
	event VoteUpdated(uint256 indexed sessionId, address indexed voter, bytes32 anonId, uint256 weight);
	event VoteRevoked(uint256 indexed sessionId, address indexed voter, bytes32 anonId);
	event VoteDelegated(uint256 indexed sessionId, address indexed from, address indexed to, uint256 weight);
	event SessionEnded(uint256 indexed sessionId);
	event ResultsRevealed(uint256 indexed sessionId, uint256 timestamp);
	event AdditionalWeightPurchased(uint256 indexed sessionId, address indexed buyer, uint256 weight, uint256 valuePaid);

	// --- Session management ---
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
		uint256 pricePerWeight
	) external onlyOwner returns (uint256 id) {
		require(optionNames.length > 0, "Options required");
		require(optionNames.length == optionWeights.length, "Option mismatch");
		require(startTime < endTime, "Invalid window");

		id = nextSessionId++;
		Session storage s = sessions[id];
		s.name = name;
		s.startTime = startTime;
		s.endTime = endTime;
		s.revealTime = revealTime == 0 ? endTime : revealTime;
		s.algorithm = algorithm;
		s.allowAnonymous = allowAnonymous;
		s.allowMultiVoteWithEth = allowMultiVoteWithEth;
		s.concealResults = concealResults;
		s.pricePerWeight = pricePerWeight;
		s.creator = msg.sender;

		for (uint256 i = 0; i < optionNames.length; ) {
			uint256 optWeight = optionWeights[i] == 0 ? 1 : optionWeights[i];
			s.options.push(Option({name: optionNames[i], weight: optWeight}));
			unchecked {
				++i;
			}
		}

		// owner and creator are authorized viewers by default
		s.authorizedViewers[msg.sender] = true;
		s.authorizedList.push(msg.sender);
		for (uint256 j = 0; j < authorizedViewers.length; ) {
			if (!s.authorizedViewers[authorizedViewers[j]]) {
				s.authorizedViewers[authorizedViewers[j]] = true;
				s.authorizedList.push(authorizedViewers[j]);
			}
			unchecked {
				++j;
			}
		}

		emit SessionCreated(id, name, startTime, endTime);
	}

	function setAuthorizedViewer(uint256 sessionId, address viewer, bool allowed) external onlyOwner {
		Session storage s = _session(sessionId);
		if (s.authorizedViewers[viewer] == allowed) return;
		s.authorizedViewers[viewer] = allowed;
		if (allowed) {
			s.authorizedList.push(viewer);
		}
	}

	function setVoterWeight(uint256 sessionId, address voter, uint256 weight) external onlyOwner {
		Session storage s = _session(sessionId);
		VoterState storage st = _ensureState(s, voter);
		st.baseWeight = weight;
	}

	function revealResults(uint256 sessionId) external {
		Session storage s = _session(sessionId);
		require(s.concealResults, "Already public");
		require(_isAuthorizedViewer(s, msg.sender) || msg.sender == owner, "Not authorized");
		s.revealed = true;
		emit ResultsRevealed(sessionId, block.timestamp);
	}

	function emitSessionEnd(uint256 sessionId) external {
		Session storage s = _session(sessionId);
		require(block.timestamp >= s.endTime, "Not ended");
		require(!s.endedEventEmitted, "Already emitted");
		s.endedEventEmitted = true;
		emit SessionEnded(sessionId);
	}

	// --- Voting entry points ---
	function castVote(
		uint256 sessionId,
		Allocation[] memory allocations,
		bool finalize
	) external {
		_cast(sessionId, msg.sender, false, bytes32(0), allocations, finalize);
	}

	function castAnonymousVote(
		uint256 sessionId,
		bytes32 anonId,
		Allocation[] memory allocations,
		bool finalize
	) external {
		Session storage s = _session(sessionId);
		require(s.allowAnonymous, "Anon disabled");
		require(anonId != bytes32(0), "Anon id required");
		_cast(sessionId, msg.sender, true, anonId, allocations, finalize);
	}

	function confirmVote(uint256 sessionId) external {
		Session storage s = _session(sessionId);
		require(_isActive(s), "Inactive");
		VoteRecord storage vr = s.votes[msg.sender];
		require(vr.status == VoteStatus.Pending, "Nothing pending");
		_applyToTotals(s, vr, true);
		vr.status = VoteStatus.Confirmed;
		emit VoteCast(sessionId, msg.sender, vr.anonId, vr.usedWeight);
	}

	function revokeVote(uint256 sessionId) external {
		Session storage s = _session(sessionId);
		require(_isActive(s), "Inactive");
		VoteRecord storage vr = s.votes[msg.sender];
		require(vr.status != VoteStatus.None, "No vote");

		if (vr.status == VoteStatus.Confirmed) {
			_applyToTotals(s, vr, false);
		}
		_clearAllocations(vr);
		vr.status = VoteStatus.None;
		vr.usedWeight = 0;
		emit VoteRevoked(sessionId, msg.sender, vr.anonId);
	}

	function updateVote(
		uint256 sessionId,
		Allocation[] memory allocations,
		bool finalize
	) external {
		_cast(sessionId, msg.sender, false, bytes32(0), allocations, finalize);
		emit VoteUpdated(sessionId, msg.sender, bytes32(0), _sumAllocations(allocations));
	}

	function delegateVote(uint256 sessionId, address to) external {
		Session storage s = _session(sessionId);
		require(_isActive(s), "Inactive");
		require(to != msg.sender, "Self delegation");
		VoteRecord storage vr = s.votes[msg.sender];
		require(vr.status == VoteStatus.None, "Already voted");

		VoterState storage fromState = _ensureState(s, msg.sender);
		require(!fromState.delegated, "Already delegated");

		address cursor = to;
		while (sessions[sessionId].voterStates[cursor].delegate != address(0)) {
			cursor = sessions[sessionId].voterStates[cursor].delegate;
			require(cursor != msg.sender, "Delegation loop");
		}

		VoterState storage toState = _ensureState(s, to);
		uint256 transferable = _availableWeight(fromState);
		require(transferable > 0, "No weight");

		fromState.delegated = true;
		fromState.delegate = to;
		fromState.baseWeight = 0;
		fromState.purchasedWeight = 0;

		if (s.votes[to].status == VoteStatus.Confirmed) {
			_distributeExtraWeight(s, s.votes[to], transferable);
		} else {
			toState.baseWeight += transferable;
		}

		emit VoteDelegated(sessionId, msg.sender, to, transferable);
	}

	function purchaseWeight(uint256 sessionId) external payable {
		Session storage s = _session(sessionId);
		require(_isActive(s), "Inactive");
		require(s.allowMultiVoteWithEth, "Purchases off");
		require(s.pricePerWeight > 0, "Price unset");
		uint256 units = msg.value / s.pricePerWeight;
		require(units > 0, "Value too low");

		VoterState storage st = _ensureState(s, msg.sender);
		st.purchasedWeight += units;

		if (s.votes[msg.sender].status == VoteStatus.Confirmed) {
			_distributeExtraWeight(s, s.votes[msg.sender], units);
		}

		uint256 refund = msg.value - (units * s.pricePerWeight);
		if (refund > 0) {
			(bool ok, ) = msg.sender.call{value: refund}("");
			require(ok, "Refund failed");
		}

		emit AdditionalWeightPurchased(sessionId, msg.sender, units, msg.value - refund);
	}

	// --- Views ---
	function getOptionTotals(uint256 sessionId) external view returns (uint256[] memory totals) {
		Session storage s = _session(sessionId);
		require(_canSeeResults(s, msg.sender), "Hidden");
		totals = new uint256[](s.options.length);
		for (uint256 i = 0; i < s.options.length; i++) {
			totals[i] = s.optionTotals[i];
		}
	}

	function getWinners(uint256 sessionId) external view returns (uint256[] memory winners) {
		Session storage s = _session(sessionId);
		require(_canSeeResults(s, msg.sender), "Hidden");
		uint256 best;
		for (uint256 i = 0; i < s.options.length; i++) {
			if (s.optionTotals[i] > best) {
				best = s.optionTotals[i];
			}
		}
		uint256 count;
		for (uint256 j = 0; j < s.options.length; j++) {
			if (s.optionTotals[j] == best) count++;
		}
		winners = new uint256[](count);
		uint256 idx;
		for (uint256 k = 0; k < s.options.length; k++) {
			if (s.optionTotals[k] == best) {
				winners[idx++] = k;
			}
		}
	}

	function getOptions(uint256 sessionId) external view returns (Option[] memory opts) {
		Session storage s = _session(sessionId);
		opts = new Option[](s.options.length);
		for (uint256 i = 0; i < s.options.length; i++) {
			opts[i] = s.options[i];
		}
	}

	function getVoteAllocations(uint256 sessionId, address voter)
		external
		view
		returns (VoteStatus status, Allocation[] memory allocations, bool anonymousVote, bytes32 anonId, uint256 usedWeight)
	{
		Session storage s = _session(sessionId);
		require(_isAuthorizedViewer(s, msg.sender) || msg.sender == voter || msg.sender == owner, "Not authorized");
		VoteRecord storage vr = s.votes[voter];
		status = vr.status;
		anonymousVote = vr.anonymousVote;
		anonId = vr.anonId;
		usedWeight = vr.usedWeight;
		allocations = new Allocation[](vr.allocations.length);
		for (uint256 i = 0; i < vr.allocations.length; i++) {
			allocations[i] = vr.allocations[i];
		}
	}

	function canSeeResults(uint256 sessionId, address viewer) external view returns (bool) {
		Session storage s = _session(sessionId);
		return _canSeeResults(s, viewer);
	}

	// --- Internal voting helpers ---
	function _cast(
		uint256 sessionId,
		address voter,
		bool isAnon,
		bytes32 anonId,
		Allocation[] memory allocations,
		bool finalize
	) internal {
		Session storage s = _session(sessionId);
		require(_isActive(s), "Inactive");
		require(allocations.length > 0, "No allocations");

		VoterState storage st = _ensureState(s, voter);
		require(!st.delegated, "Delegated");

		for (uint256 i = 0; i < allocations.length; ) {
			require(allocations[i].optionId < s.options.length, "Bad option");
			unchecked {
				++i;
			}
		}

		uint256 requested = _sumAllocations(allocations);
		uint256 available = _availableWeight(st);
		require(requested > 0 && requested <= available, "Bad weight");

		VoteRecord storage vr = s.votes[voter];
		// If already confirmed, remove old totals first
		if (vr.status == VoteStatus.Confirmed) {
			_applyToTotals(s, vr, false);
		}

		_storeAllocations(vr, allocations);
		vr.anonymousVote = isAnon;
		vr.anonId = anonId;
		vr.usedWeight = requested;
		vr.status = finalize ? VoteStatus.Confirmed : VoteStatus.Pending;

		if (finalize) {
			_applyToTotals(s, vr, true);
			emit VoteCast(sessionId, voter, anonId, requested);
		} else {
			emit VotePrepared(sessionId, voter, anonId, requested);
		}

		if (isAnon) {
			VoteRecord storage anonRec = s.anonVotes[anonId];
			_storeAllocations(anonRec, allocations);
			anonRec.status = vr.status;
			anonRec.anonymousVote = true;
			anonRec.anonId = anonId;
			anonRec.usedWeight = requested;
		}
	}

	function _storeAllocations(VoteRecord storage vr, Allocation[] memory allocations) internal {
		_clearAllocations(vr);
		delete vr.allocations;
		for (uint256 i = 0; i < allocations.length; ) {
			vr.allocations.push(allocations[i]);
			unchecked {
				++i;
			}
		}
	}

	function _clearAllocations(VoteRecord storage vr) internal {
		delete vr.allocations;
	}

	function _applyToTotals(Session storage s, VoteRecord storage vr, bool add) internal {
		for (uint256 i = 0; i < vr.allocations.length; ) {
			Allocation storage alloc = vr.allocations[i];
			uint256 weighted = alloc.weight * s.options[alloc.optionId].weight;
			if (add) {
				s.optionTotals[alloc.optionId] += weighted;
			} else {
				s.optionTotals[alloc.optionId] -= weighted;
			}
			unchecked {
				++i;
			}
		}
	}

	function _distributeExtraWeight(Session storage s, VoteRecord storage vr, uint256 addedWeight) internal {
		require(vr.status == VoteStatus.Confirmed, "No confirmed vote");
		if (addedWeight == 0 || vr.usedWeight == 0) return;

		uint256 remaining = addedWeight;
		for (uint256 i = 0; i < vr.allocations.length; ) {
			Allocation storage alloc = vr.allocations[i];
			uint256 extra = (addedWeight * alloc.weight) / vr.usedWeight;
			if (i == vr.allocations.length - 1) {
				extra = remaining; // absorb rounding
			}
			alloc.weight += extra;
			uint256 weighted = extra * s.options[alloc.optionId].weight;
			s.optionTotals[alloc.optionId] += weighted;
			remaining -= extra;
			unchecked {
				++i;
			}
		}
		vr.usedWeight += addedWeight;
	}

	// --- internal utils ---
	function _session(uint256 sessionId) internal view returns (Session storage s) {
		s = sessions[sessionId];
		require(s.endTime != 0, "Session missing");
	}

	function _isActive(Session storage s) internal view returns (bool) {
		return block.timestamp >= s.startTime && block.timestamp < s.endTime;
	}

	function _availableWeight(VoterState storage st) internal view returns (uint256) {
		uint256 base = st.exists ? st.baseWeight : 1;
		return base + st.purchasedWeight;
	}

	function _ensureState(Session storage s, address voter) internal returns (VoterState storage) {
		VoterState storage st = s.voterStates[voter];
		if (!st.exists) {
			st.exists = true;
			st.baseWeight = 1;
		}
		return st;
	}

	function _sumAllocations(Allocation[] memory allocations) internal pure returns (uint256 total) {
		for (uint256 i = 0; i < allocations.length; ) {
			total += allocations[i].weight;
			unchecked {
				++i;
			}
		}
	}

	function _canSeeResults(Session storage s, address viewer) internal view returns (bool) {
		if (!s.concealResults) return true;
		if (s.revealed) return true;
		if (block.timestamp >= s.revealTime) return true;
		if (!_isActive(s)) return true; // session ended
		return _isAuthorizedViewer(s, viewer) || viewer == owner;
	}

	function _isAuthorizedViewer(Session storage s, address viewer) internal view returns (bool) {
		return s.authorizedViewers[viewer];
	}
}
