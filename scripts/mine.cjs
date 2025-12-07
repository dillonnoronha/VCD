// Mine blocks on a Hardhat dev node via JSON-RPC.
// Usage:
//   node scripts/mine.cjs             # mines 0x64 (100) blocks on default RPC
//   BLOCKS=0x20 RPC=http://192.168.1.143:8545 node scripts/mine.cjs

const rpc = process.env.RPC || "http://192.168.1.143:8545";
const blocks = process.env.BLOCKS || "0x64";

(async () => {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "hardhat_mine",
      params: [blocks],
    }),
  });
  const body = await res.json();
  if (body.error) {
    console.error("RPC error:", body.error);
    process.exit(1);
  }
  console.log(`Mined ${parseInt(blocks, 16)} blocks on ${rpc}.`);
})();
