# Security Notes

- Reentrancy: The only external call is the refund in `purchaseWeight`; guarded with a `nonReentrant` mutex. No other external calls present.
- Authorization: Result visibility and vote inspection are gated via `authorizedViewers`/owner checks; ties and winners are read-only.
- Delegation loops: Defensive checks prevent self-delegation and cycle creation.
- Arithmetic: Solidity 0.8+ checked math; option index bounds validated on input.
- Anonymity: Anonymous votes store only aggregate metadata; consider commit-reveal or alias registration if stronger unlinkability is required.
- Payments: `pricePerWeight` set by owner; purchases revert on zero price or insufficient value; refunds use `call` and reentrancy guard.
