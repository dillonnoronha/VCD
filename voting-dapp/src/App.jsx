import { useEffect, useState } from "react";
import { ethers } from "ethers";
import BallotArtifact from "./abis/Ballot.json";
import { BALLOT_ADDRESS } from "./config";

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);

  const [chairperson, setChairperson] = useState(null);
  const [isChairperson, setIsChairperson] = useState(false);

  const [proposals, setProposals] = useState([]);
  const [winner, setWinner] = useState(null);

  const [giveRightAddr, setGiveRightAddr] = useState("");
  const [delegateAddr, setDelegateAddr] = useState("");
  const [status, setStatus] = useState("");

  const checkCode = async () => {
  if (!provider) {
    setStatus("Provider not ready");
    return;
  }
  const code = await provider.getCode(BALLOT_ADDRESS);
  console.log("Code at", BALLOT_ADDRESS, "=", code);
  if (code === "0x") {
    setStatus("No contract code at BALLOT_ADDRESS on this network.");
  } else {
    setStatus("Contract code found at BALLOT_ADDRESS.");
  }
};


  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const acct = await signer.getAddress();

      const ballot = new ethers.Contract(
        BALLOT_ADDRESS,
        BallotArtifact.abi,
        signer
      );

      const cp = await ballot.chairperson();

      setProvider(provider);
      setSigner(signer);
      setAccount(acct);
      setContract(ballot);
      setChairperson(cp);
      setIsChairperson(acct.toLowerCase() === cp.toLowerCase());
      setStatus("Connected.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to connect wallet.");
    }
  };

  const loadProposals = async () => {
    if (!contract) return;

    const list = [];
    let i = 0;
    while (true) {
      try {
        const p = await contract.proposals(i);
        // p.name is bytes32 → decode
        const name = ethers.decodeBytes32String(p.name);
        list.push({
          index: i,
          name,
          voteCount: p.voteCount.toString(),
        });
        i++;
      } catch (err) {
        break;
      }
    }

    setProposals(list);
    setStatus(`Loaded ${list.length} proposals.`);
  };

  const handleVote = async (index) => {
    if (!contract || !account) return;
    try {
      setStatus(`Sending vote for proposal #${index}...`);
      const tx = await contract.vote(index);
      await tx.wait();
      setStatus("Vote confirmed!");
      await loadProposals();
    } catch (err) {
      console.error(err);
      setStatus("Vote failed. Check console for details.");
    }
  };

  const handleGiveRight = async () => {
    if (!contract || !account) return;
    if (!giveRightAddr) {
      setStatus("Please enter an address.");
      return;
    }
    try {
      setStatus(`Giving right to vote to ${giveRightAddr}...`);
      const tx = await contract.giveRightToVote(giveRightAddr);
      await tx.wait();
      setStatus(`Successfully gave right to vote to ${giveRightAddr}.`);
    } catch (err) {
      console.error(err);
      setStatus("Failed to give right to vote.");
    }
  };

  const handleDelegate = async () => {
    if (!contract || !account) return;
    if (!delegateAddr) {
      setStatus("Please enter an address to delegate to.");
      return;
    }
    try {
      setStatus(`Delegating vote to ${delegateAddr}...`);
      const tx = await contract.delegate(delegateAddr);
      await tx.wait();
      setStatus(`Successfully delegated vote to ${delegateAddr}.`);
    } catch (err) {
      console.error(err);
      setStatus("Delegation failed.");
    }
  };

  const loadWinner = async () => {
    if (!contract) return;
    try {
      const w = await contract.winnerName();
      const name = ethers.decodeBytes32String(w);
      setWinner(name);
      setStatus("Loaded current winner.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to load winner.");
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Simple Voting DApp</h1>

      <button onClick={checkCode} disabled={!provider}>
        Check Contract Code
      </button>
      {!account ? (
        <button onClick={connectWallet}>Connect MetaMask</button>
      ) : (
        <div style={{ marginBottom: "16px" }}>
          <p><strong>Account:</strong> {account}</p>
          <p><strong>Chairperson:</strong> {chairperson}</p>
          <p>
            <strong>Role:</strong>{" "}
            {isChairperson ? "Chairperson" : "Regular voter"}
          </p>
        </div>
      )}

      {account && (
        <>
          <div style={{ marginBottom: "16px" }}>
            <button onClick={loadProposals} disabled={!contract}>
              Load Proposals
            </button>{" "}
            <button onClick={loadWinner} disabled={!contract}>
              Show Winner
            </button>
          </div>

          {isChairperson && (
            <div
              style={{
                border: "1px solid #ccc",
                padding: "10px",
                marginBottom: "16px",
              }}
            >
              <h3>Chairperson Controls</h3>
              <div style={{ marginBottom: "8px" }}>
                <label>
                  Address to give right to vote:{" "}
                  <input
                    type="text"
                    value={giveRightAddr}
                    onChange={(e) => setGiveRightAddr(e.target.value)}
                    style={{ width: "350px" }}
                  />
                </label>
                <button onClick={handleGiveRight} style={{ marginLeft: "8px" }}>
                  Give Right to Vote
                </button>
              </div>
            </div>
          )}

          <div
            style={{
              border: "1px solid #ccc",
              padding: "10px",
              marginBottom: "16px",
            }}
          >
            <h3>Delegate Vote</h3>
            <label>
              Delegate to address:{" "}
              <input
                type="text"
                value={delegateAddr}
                onChange={(e) => setDelegateAddr(e.target.value)}
                style={{ width: "350px" }}
              />
            </label>
            <button onClick={handleDelegate} style={{ marginLeft: "8px" }}>
              Delegate
            </button>
          </div>

          <div
            style={{
              border: "1px solid #ccc",
              padding: "10px",
              marginBottom: "16px",
            }}
          >
            <h3>Proposals</h3>
            {proposals.length === 0 && <p>No proposals loaded yet.</p>}
            {proposals.map((p) => (
              <div
                key={p.index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "6px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <strong>#{p.index}: {p.name}</strong> — votes: {p.voteCount}
                </div>
                <button onClick={() => handleVote(p.index)}>Vote</button>
              </div>
            ))}
          </div>

          
          {winner && (
            <div
              style={{
                border: "2px solid green",
                padding: "10px",
                marginBottom: "16px",
              }}
            >
              <h3>Current Winner</h3>
              <p style={{ fontSize: "18px" }}>{winner}</p>
            </div>
          )}
        </>
      )}

      
      {status && (
        <div style={{ marginTop: "16px", color: "#555" }}>
          <strong>Status:</strong> {status}
        </div>
      )}
    </div>
  );
}

export default App;
