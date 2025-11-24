// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title VotingHub
 * @notice Flexible on-chain voting hub supporting multiple concurrent sessions, weighted voting,
 * delegation, anonymous aliases, optional result concealment, and vote lifecycle controls.
 */
contract VotingHub {
	// --- Custom errors ---
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

	// --- Ownership ---
	address public owner;
	uint256 private unlocked = 1;

	modifier onlyOwner() {
		if (msg.sender != owner) revert NotOwner();
		_;
	}

	modifier nonReentrant() {
		if (unlocked == 0) revert Reentrancy();
		unlocked = 0;
		_;
		unlocked = 1;
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
		if (optionNames.length == 0) revert OptionsRequired();
		if (optionNames.length != optionWeights.length) revert OptionMismatch();
		if (startTime >= endTime) revert InvalidWindow();

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
		if (!s.concealResults) revert AlreadyPublic();
		if (!_isAuthorizedViewer(s, msg.sender) && msg.sender != owner) revert NotAuthorized();
		s.revealed = true;
		emit ResultsRevealed(sessionId, block.timestamp);
	}

	function emitSessionEnd(uint256 sessionId) external {
		Session storage s = _session(sessionId);
		if (block.timestamp < s.endTime) revert Inactive();
		if (s.endedEventEmitted) revert AlreadyEmitted();
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
		if (!s.allowAnonymous) revert AnonDisabled();
		if (anonId == bytes32(0)) revert AnonIdRequired();
		_cast(sessionId, msg.sender, true, anonId, allocations, finalize);
	}

	function confirmVote(uint256 sessionId) external {
		Session storage s = _session(sessionId);
		if (!_isActive(s)) revert Inactive();
		VoteRecord storage vr = s.votes[msg.sender];
		if (vr.status != VoteStatus.Pending) revert NothingPending();
		_applyToTotals(s, vr, true);
		vr.status = VoteStatus.Confirmed;
		emit VoteCast(sessionId, msg.sender, vr.anonId, vr.usedWeight);
	}

	function revokeVote(uint256 sessionId) external {
		Session storage s = _session(sessionId);
		if (!_isActive(s)) revert Inactive();
		VoteRecord storage vr = s.votes[msg.sender];
		if (vr.status == VoteStatus.None) revert NoVote();

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
		if (!_isActive(s)) revert Inactive();
		if (to == msg.sender) revert SelfDelegation();
		VoteRecord storage vr = s.votes[msg.sender];
		if (vr.status != VoteStatus.None) revert AlreadyVoted();

		VoterState storage fromState = _ensureState(s, msg.sender);
		if (fromState.delegated) revert Delegated();

		address cursor = to;
		while (sessions[sessionId].voterStates[cursor].delegate != address(0)) {
			cursor = sessions[sessionId].voterStates[cursor].delegate;
			if (cursor == msg.sender) revert DelegationLoop();
		}

		VoterState storage toState = _ensureState(s, to);
		uint256 transferable = _availableWeight(fromState);
		if (transferable == 0) revert NoWeight();

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

	function purchaseWeight(uint256 sessionId) external payable nonReentrant {
		Session storage s = _session(sessionId);
		if (!_isActive(s)) revert Inactive();
		if (!s.allowMultiVoteWithEth) revert PurchasesOff();
		if (s.pricePerWeight == 0) revert PriceUnset();
		uint256 units = msg.value / s.pricePerWeight;
		if (units == 0) revert ValueTooLow();

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
		if (!_canSeeResults(s, msg.sender)) revert NotAuthorized();
		totals = new uint256[](s.options.length);
		for (uint256 i = 0; i < s.options.length; i++) {
			totals[i] = s.optionTotals[i];
		}
	}

	function getWinners(uint256 sessionId) external view returns (uint256[] memory winners) {
		Session storage s = _session(sessionId);
		if (!_canSeeResults(s, msg.sender)) revert NotAuthorized();
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
		if (!_isAuthorizedViewer(s, msg.sender) && msg.sender != voter && msg.sender != owner) {
			revert NotAuthorized();
		}
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
		if (!_isActive(s)) revert Inactive();
		if (allocations.length == 0) revert BadWeight();

		VoterState storage st = _ensureState(s, voter);
		if (st.delegated) revert Delegated();

		for (uint256 i = 0; i < allocations.length; ) {
			if (allocations[i].optionId >= s.options.length) revert BadOption();
			unchecked {
				++i;
			}
		}

		uint256 requested = _sumAllocations(allocations);
		uint256 available = _availableWeight(st);
		if (requested == 0 || requested > available) revert BadWeight();

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
			s.anonVotes[anonId] = AnonMeta({status: vr.status, usedWeight: requested});
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
