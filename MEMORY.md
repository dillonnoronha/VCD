# Project Memory

## Architecture
- Diamond-based voting system. Single user-facing address (VotingDiamond) with facets:
  - CoreFacet: session creation, cast/confirm/revoke/update votes, views (options, totals, winners, allocations, session meta, list sessions).
  - DelegationFacet: vote delegation logic (loop checks, weight transfer, confirmed-vote adjustments).
  - PurchaseFacet: purchaseWeight with price/flag checks and proportional top-up of confirmed votes.
  - RevealFacet: conceal/reveal, authorized viewers, emitSessionEnd.
  - StrategyFacet: per-algorithm strategy registry (default WeightedSplitStrategy) with set/clear.
  - AdminFacet: owner management, nextSessionId, setVoterWeight.
- Shared storage at fixed slot (`VotingStorage`): owner, nextSessionId, sessionIds[], strategy mapping, sessions mapping.
- Strategies: WeightedSplitStrategy (default for algos 0/1/2) via StrategyFacet.
- Interface: VotingHubInterface defines all events/functions and custom errors (NotOwner, OptionsRequired, OptionMismatch, InvalidWindow, Inactive, Delegated, BadOption, BadWeight, AnonDisabled, AnonIdRequired, NotAuthorized, AlreadyPublic, AlreadyEmitted, SelfDelegation, AlreadyVoted, DelegationLoop, NoWeight, ValueTooLow, PriceUnset, PurchasesOff, NothingPending, NoVote, NoConfirmedVote, Reentrancy, StrategyNotSet, ZeroOwner, SessionMissing, RefundFailed).

## Deployment
- Ignition module `ignition/modules/VotingDiamond.ts` dynamically maps function signatures to facets, deploys facets/diamond, sets default strategies for algos 0/1/2 to WeightedSplitStrategy. Uses selector derivation (ethers.id) instead of hardcoded hex.
- Diamond constructor args: selectors[], impls[], owner.

## Tests
- All tests in `test/VotingHub.ts` target the diamond via VotingHubInterface. Scenarios include:
  - Session create/meta/list, casting/updating/revoking, split votes, anonymous votes, conceal/reveal gating.
  - Delegation (loop prevention, already voted/delegated/no weight, confirmed vote weight adjustment).
  - Purchase flow (price/value checks, session missing, refund failure reentrancy helper).
  - Strategy registry (set/clear, non-owner reverts, missing strategy).
  - Authorization/reveal/session end events and double calls, inactive windows, unauthorized views.
  - Error branches: option mismatch, invalid window, bad option/weight, anon disabled/id required, NotAuthorized, SessionMissing, etc.
  - Concurrent-like simulation: 100 biased randomized voters casting in parallel (automine on), verifying option 0 wins.
  - Unknown selector/facet owner check.
- Current `npx hardhat test` passes 37/37.
- Coverage (with `--coverage` alone) previously ~99.75% line / ~98.8% stmt. Some minor partials in Admin/Delegation/Purchase early returns.
- Using `--gas-stats` (with or without coverage) can crash Hardhat EDR after printing stats; use plain tests/coverage or custom gas scripts if needed.

## Notable files
- Contracts: facets under `contracts/diamond/facets`, storage `contracts/diamond/lib/VotingStorage.sol`, strategies under `contracts/voting/strategies`, interface `contracts/VotingHubInterface.sol`, helper `contracts/ReenterPurchaser.sol` (coverage ignored).
- Config: `hardhat.config.ts` (optimizer runs=50, viaIR true).
- Scripts: `scripts/deployDiamond.ts` deploys facets/diamond and sets default strategies.
- README untouched; .gitignore ignores local docs (gas-report.md, SECURITY.md, mise.toml), build artifacts, node_modules, etc.

## Branch
- Current branch: `alpha` (no upstream set).

## Warnings
- Do not use `--gas-stats` with EDR unless acceptable to crash after stats.
- Contract size: facets and diamond are small; monolith removed.

## Past sessions
- codex resume 019ab37d-911d-7cd0-8e62-5f597f42f393