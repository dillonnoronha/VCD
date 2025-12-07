import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Attach to an existing VotingDiamond and map algorithms 0/1/2
 * to a freshly deployed WeightedSplitStrategy.
 *
 * Params:
 *  - diamond: address of existing VotingDiamond
 *  - owner (optional): address to send the setStrategy calls from (defaults to account[0])
 */
export default buildModule("SetStrategiesModule", (m) => {
  const diamond = m.getParameter("diamond");
  const owner = m.getParameter("owner", m.getAccount(0));

  const strategy = m.contract("WeightedSplitStrategy");
  const strategyFacet = m.contractAt("StrategyFacet", diamond, { id: "StrategyFacetAtExisting" });

  for (const alg of [0, 1, 2]) {
    m.call(strategyFacet, "setStrategy", [alg, strategy], {
      id: `SetStrategyExisting_${alg}`,
    });
  }

  return { strategy };
});
