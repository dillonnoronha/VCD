# Gas Measurements

Baseline measurements taken on Hardhat local network (Node 22.21.1, solidity 0.8.28, optimizer+viaIR):

- createSession: 435,590 gas
- castVote (finalize=true): 199,112 gas
- castVote (update): 103,021 gas
- castVote (prepare only): 58,866 gas
- confirmVote: 71,171 gas
- revokeVote: 50,501 gas
- delegateVote: 86,418 gas
- castVote (delegated weight): 158,979 gas
- purchaseWeight: 84,537 gas
- castAnonymousVote: 376,147 gas
- revealResults: 32,527 gas

Optimized (custom errors + lighter anon storage):

- createSession: 435,566 gas
- castVote (finalize=true): 199,078 gas
- castVote (update): 102,987 gas
- castVote (prepare only): 58,840 gas
- confirmVote: 71,147 gas
- revokeVote: 50,482 gas
- delegateVote: 86,394 gas
- castVote (delegated weight): 158,945 gas
- purchaseWeight: 84,513 gas
- castAnonymousVote: 286,636 gas
- revealResults: 32,498 gas

Current (with reentrancy guard on purchases):

- createSession: 435,566 gas
- castVote (finalize=true): 199,078 gas
- castVote (update): 102,987 gas
- castVote (prepare only): 58,840 gas
- confirmVote: 71,147 gas
- revokeVote: 50,482 gas
- delegateVote: 86,397 gas
- castVote (delegated weight): 158,945 gas
- purchaseWeight: 86,843 gas
- castAnonymousVote: 286,636 gas
- revealResults: 32,498 gas

Notes:
- Measurements are approximate and specific to the probed sequence; different allocations and branch choices will vary.
- Anonymous voting remains the heaviest due to alias metadata and allocations.
- Optimizer + `viaIR` enabled in `hardhat.config.ts`.
- Hardhat coverage (test --coverage) ~100% line / ~92% statement for `VotingHub.sol`.
- For fresh gas numbers, run `npx hardhat test --gas-stats` (built-in) instead of the removed manual probe script.
