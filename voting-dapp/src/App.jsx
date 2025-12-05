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
  const [winnerNames, setWinnerNames] = useState([]);
  const [winnerIndices, setWinnerIndices] = useState([]);

  const [deadline, setDeadline] = useState(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [hasEnded, setHasEnded] = useState(false);

  const [giveRightAddr, setGiveRightAddr] = useState("");
  const [delegateAddr, setDelegateAddr] = useState("");
  const [status, setStatus] = useState("");
  const [batchGiveRight, setBatchGiveRight] = useState("");
  const [events, setEvents] = useState([]);
  const [ballots, setBallots] = useState([
    { address: BALLOT_ADDRESS, label: "Default Ballot" },
  ]);
  const [currentBallotAddress, setCurrentBallotAddress] = useState(BALLOT_ADDRESS);
  const [newProposalsText, setNewProposalsText] = useState("");
  const [newDurationMinutes, setNewDurationMinutes] = useState(5);
  const [voterStatus, setVoterStatus] = useState(null);
  const [voterStatusAddr, setVoterStatusAddr] = useState("");
  const [txHistory, setTxHistory] = useState([]);



  const formatTime = (seconds) => {
    if (seconds <= 0) return "00:00";

    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;

    if (min > 0) return `${min}m ${sec}s`;
    return `${sec}s`;
  };

  useEffect(() => {
    if (!deadline) return;

    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = deadline - now;

      if (remaining <= 0) {
        setHasEnded(true);
        setTimeLeft("Voting has ended");
      } else {
        setTimeLeft(formatTime(remaining));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deadline]);

  useEffect(() => {
    if (!contract) return;

    const handleVoteCast = (voter, proposal, weight, event) => {
      setEvents((prev) => [
        {
          type: "VoteCast",
          voter,
          proposal: Number(proposal),
          weight: weight.toString(),
          txHash: event.log.transactionHash,
        },
        ...prev,
      ]);
    };

    const handleRightGiven = (chair, voter, event) => {
      setEvents((prev) => [
        {
          type: "RightGiven",
          chair,
          voter,
          txHash: event.log.transactionHash,
        },
        ...prev,
      ]);
    };

    const handleDelegated = (from, to, event) => {
      setEvents((prev) => [
        {
          type: "Delegated",
          from,
          to,
          txHash: event.log.transactionHash,
        },
        ...prev,
      ]);
    };

    contract.on("VoteCast", handleVoteCast);
    contract.on("RightGiven", handleRightGiven);
    contract.on("Delegated", handleDelegated);

    return () => {
      contract.off("VoteCast", handleVoteCast);
      contract.off("RightGiven", handleRightGiven);
      contract.off("Delegated", handleDelegated);
    };
  }, [contract]);


  const checkCode = async () => {
    if (!provider) {
      setStatus("Provider not ready");
      return;
    }
    const code = await provider.getCode(currentBallotAddress);
    console.log("Code at", currentBallotAddress, "=", code);
    if (code === "0x") {
      setStatus("No contract code at BALLOT_ADDRESS on this network.");
    } else {
      setStatus("Contract code found at BALLOT_ADDRESS.");
    }
  };

  const recordTx = (entry) => {
    setTxHistory((prev) => [
      {
        ...entry,
        ts: new Date().toLocaleTimeString(),
      },
      ...prev,
    ]);
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
        currentBallotAddress,
        BallotArtifact.abi,
        signer
      );


      const cp = await ballot.chairperson();
      const dl = await ballot.deadline();
      const ended = await ballot.hasEnded();

      setProvider(provider);
      setSigner(signer);
      setAccount(acct);
      setContract(ballot);
      setChairperson(cp);
      setIsChairperson(acct.toLowerCase() === cp.toLowerCase());
      setDeadline(Number(dl));
      setHasEnded(ended);

      setStatus("Connected.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to connect wallet.");
    }
  };

  const switchBallot = async (addr) => {
    if (!provider || !signer) {
      setStatus("Connect wallet first.");
      return;
    }

    try {
      const ballot = new ethers.Contract(addr, BallotArtifact.abi, signer);
      const cp = await ballot.chairperson();
      const dl = await ballot.deadline();
      const ended = await ballot.hasEnded();

      setContract(ballot);
      setChairperson(cp);
      setIsChairperson(account?.toLowerCase() === cp.toLowerCase());
      setDeadline(Number(dl));
      setHasEnded(ended);
      setCurrentBallotAddress(addr);

      setProposals([]);
      setWinnerNames([]);
      setWinnerIndices([]);
      setEvents?.([]);
      setStatus(`Switched to ballot ${addr}`);
    } catch (err) {
      console.error(err);
      setStatus("Failed to switch ballot.");
    }
  };

  const handleCreateBallot = async () => {
    const ballot = await factory.deploy(proposalBytes32, durationSeconds);
    await ballot.waitForDeployment();
    const addr = await ballot.getAddress();
    if (!signer) {
      setStatus("Connect wallet first.");
      return;
    }

    const raw = newProposalsText.trim();
    if (!raw) {
      setStatus("Enter at least one proposal (comma-separated).");
      return;
    }

    const labels = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (labels.length === 0) {
      setStatus("No valid proposals found.");
      return;
    }

    let proposalBytes32;
    try {
      proposalBytes32 = labels.map((name) =>
        ethers.encodeBytes32String(name)
      );
    } catch (e) {
      console.error(e);
      setStatus("One of the proposal names is too long to fit in bytes32.");
      return;
    }

    const minutes = Number(newDurationMinutes) || 0;
    const durationSeconds = Math.max(60, minutes * 60);

    try {
      setStatus("Deploying new ballot...");
      const factory = new ethers.ContractFactory(
        BallotArtifact.abi,
        BallotArtifact.bytecode,
        signer
      );

      const ballot = await factory.deploy(proposalBytes32, durationSeconds);
      await ballot.waitForDeployment();
      const addr = await ballot.getAddress();

      setBallots((prev) => [
        {
          address: addr,
          label: `${labels.join(", ")} (${addr.slice(0, 6)}...)`,
        },
        ...prev,
      ]);

      await switchBallot(addr);

      setStatus(`Deployed new ballot at ${addr}`);
    } catch (err) {
      console.error(err);
      setStatus("Failed to deploy new ballot.");
    }

    recordTx({
      type: "CreateBallot",
      from: account,
      ballot: addr,
      description: `Created new ballot with proposals: ${labels.join(", ")}`,
      hash: ballot.deploymentTransaction().hash,
    });
  };

  const loadProposals = async () => {
    if (!contract) return;

    const list = [];
    let i = 0;
    while (true) {
      try {
        const p = await contract.proposals(i);
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
    if (hasEnded) {
      setStatus("Voting has ended.");
      return;
    }
    try {
      setStatus(`Sending vote for #${index}...`);
      const tx = await contract.vote(index);
      await tx.wait();
      setStatus("Vote confirmed!");
      await loadProposals();
      await loadWinner();

      recordTx({
        type: "Vote",
        from: account,
        ballot: currentBallotAddress,
        description: `Voted for proposal #${index}`,
        hash: tx.hash,
      });
    } catch (err) {
      console.error(err);
      setStatus("Vote failed.");
    }
  };

  const handleGiveRight = async () => {
    if (hasEnded) {
      setStatus("Voting has ended.");
      return;
    }
    try {
      setStatus(`Giving right to ${giveRightAddr}...`);
      const tx = await contract.giveRightToVote(giveRightAddr);
      await tx.wait();
      setStatus("Right to vote granted.");

      recordTx({
        type: "GiveRight",
        from: account,
        ballot: currentBallotAddress,
        description: `Gave right to vote to ${giveRightAddr}`,
        hash: tx.hash,
      });
    } catch (err) {
      console.error(err);
      setStatus("Failed.");
    }
  };

  const handleGiveRightBatch = async () => {
    if (!contract || !account) return;

    const raw = batchGiveRight.trim();
    if (!raw) {
      setStatus("Please enter at least one address (comma or space separated).");
      return;
    }

    const parts = raw
      .split(/[,\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      setStatus("No valid addresses found.");
      return;
    }

    try {
      setStatus(`Giving right to vote to ${parts.length} addresses...`);
      const tx = await contract.giveRightToMany(parts);
      await tx.wait();
      setStatus(`Successfully gave right to ${parts.length} addresses.`);

      recordTx({
        type: "GiveRightBatch",
        from: account,
        ballot: currentBallotAddress,
        description: `Gave right to ${parts.length} addresses`,
        hash: tx.hash,
      });
    } catch (err) {
      console.error(err);
      setStatus("Failed to batch–give right to vote. Check console for details.");
    }
  };

  const handleDelegate = async () => {
    if (hasEnded) {
      setStatus("Voting has ended.");
      return;
    }
    try {
      setStatus(`Delegating to ${delegateAddr}...`);
      const tx = await contract.delegate(delegateAddr);
      await tx.wait();
      setStatus(`Delegated to ${delegateAddr}.`);

      recordTx({
        type: "Delegate",
        from: account,
        ballot: currentBallotAddress,
        description: `Delegated vote to ${delegateAddr}`,
        hash: tx.hash,
      });
    } catch (err) {
      console.error(err);
      setStatus("Delegation failed.");
    }
  };

  const loadWinner = async () => {
    if (!contract) return;

    try {
      const indicesBN = await contract.getWinners();
      const indices = indicesBN.map((bn) => Number(bn));

      if (indices.length === 0) {
        setWinnerNames([]);
        setWinnerIndices([]);
        setStatus("No votes have been cast yet.");
        return;
      }

      const names = [];
      for (const idx of indices) {
        const p = await contract.proposals(idx);
        names.push(ethers.decodeBytes32String(p.name));
      }

      setWinnerNames(names);
      setWinnerIndices(indices);

      if (indices.length === 1) {
        setStatus(`Current winner: ${names[0]}`);
      } else {
        setStatus(`We have a tie between: ${names.join(", ")}`);
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to load winner(s).");
    }
  };
  const loadVoterStatus = async (explicitAddr) => {
    if (!contract || !account) {
      setStatus("Connect wallet first.");
      return;
    }

    const target = (explicitAddr || voterStatusAddr || account).trim();
    if (!target) {
      setStatus("No address specified.");
      return;
    }

    try {
      setStatus(`Loading voter status for ${target}...`);

      const v = await contract.voters(target);

      const weight = v.weight.toString();
      const voted = v.voted;
      const delegate = v.delegate;
      const voteIndex = Number(v.vote);

      let voteName = null;
      if (voted && voteIndex >= 0) {
        try {
          const p = await contract.proposals(voteIndex);
          voteName = ethers.decodeBytes32String(p.name);
        } catch {
          voteName = null;
        }
      }

      setVoterStatus({
        address: target,
        weight,
        voted,
        delegate,
        voteIndex,
        voteName,
      });

      setStatus(`Loaded voter status for ${target}.`);
    } catch (err) {
      console.error(err);
      setStatus("Failed to load voter status (see console).");
    }
  };

  const totalProposals = proposals.length;
  const totalVotes = proposals.reduce(
    (sum, p) => sum + Number(p.voteCount || 0),
    0
  );

  const winningSummary =
    winnerNames.length === 0
      ? "No winner yet"
      : winnerNames.length === 1
        ? winnerNames[0]
        : `Tie between ${winnerNames.join(", ")}`;

  return (
    <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Timed Voting DApp</h1>

      <button onClick={checkCode} disabled={!provider}>
        Check Contract Code
      </button>

      {!account ? (
        <button onClick={connectWallet}>Connect MetaMask</button>
      ) : (
        <div style={{ marginBottom: "10px" }}>
          <p><strong>Account:</strong> {account}</p>
          <p><strong>Chairperson:</strong> {chairperson}</p>
          <p><strong>Ballot Address:</strong> {currentBallotAddress}</p>
          <p>
            <strong>Voting Status:</strong>{" "}
            {hasEnded ? "Ended" : "Active"}
          </p>
          {deadline && (
            <p>
              <strong>Time Remaining:</strong>{" "}
              {hasEnded ? "Voting ended" : timeLeft}
            </p>
          )}
        </div>

      )}

      {account && (
        <>
          <button onClick={loadProposals} disabled={!contract}>
            Load Proposals
          </button>{" "}
          <button onClick={loadWinner} disabled={!contract}>
            Show Winner
          </button>
          {isChairperson && (
            <div
              style={{
                border: "2px solid #1976d2",
                padding: "12px",
                marginTop: "16px",
                borderRadius: "6px",
                backgroundColor: "#f0f7ff",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Chairperson Dashboard</h3>
              <p style={{ margin: "4px 0" }}>
                <strong>Ballot:</strong> {currentBallotAddress}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Status:</strong>{" "}
                {hasEnded ? "Voting ended" : "Voting active"}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Proposals:</strong> {totalProposals}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Total Votes Cast:</strong> {totalVotes}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Current Result:</strong> {winningSummary}
              </p>
              {deadline && (
                <p style={{ margin: "4px 0" }}>
                  <strong>Time Remaining:</strong>{" "}
                  {hasEnded ? "Voting ended" : timeLeft}
                </p>
              )}

              <div style={{ marginTop: "8px" }}>
                <button
                  onClick={loadProposals}
                  disabled={!contract}
                  style={{ marginRight: "8px" }}
                >
                  🔄 Refresh Proposals
                </button>
                <button
                  onClick={loadWinner}
                  disabled={!contract}
                  style={{ marginRight: "8px" }}
                >
                  🏆 Refresh Winners
                </button>
                <button
                  onClick={() => {
                    loadProposals();
                    loadWinner();
                  }}
                  disabled={!contract}
                >
                  📊 Refresh All
                </button>
              </div>
            </div>
          )}
          <div
            style={{
              border: "1px solid #ccc",
              padding: "10px",
              marginTop: "16px",
            }}
          >
            <h3>Ballot Selection</h3>
            <p style={{ fontSize: "14px" }}>
              <strong>Current:</strong> {currentBallotAddress}
            </p>

            {ballots.length > 1 && (
              <div style={{ marginBottom: "10px" }}>
                <label>
                  Switch ballot:{" "}
                  <select
                    value={currentBallotAddress}
                    onChange={(e) => switchBallot(e.target.value)}
                  >
                    {ballots.map((b) => (
                      <option key={b.address} value={b.address}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {isChairperson && (
              <div style={{ marginTop: "10px" }}>
                <h4>Create New Ballot</h4>
                <label>
                  Proposals (comma-separated):
                  <br />
                  <input
                    type="text"
                    value={newProposalsText}
                    onChange={(e) => setNewProposalsText(e.target.value)}
                    placeholder="Red, Blue, Green"
                    style={{ width: "100%", marginTop: "4px" }}
                  />
                </label>
                <br />
                <label style={{ marginTop: "6px", display: "inline-block" }}>
                  Duration (minutes):{" "}
                  <input
                    type="number"
                    min="1"
                    value={newDurationMinutes}
                    onChange={(e) => setNewDurationMinutes(e.target.value)}
                    style={{ width: "80px", marginLeft: "4px" }}
                  />
                </label>
                <br />
                <button onClick={handleCreateBallot} style={{ marginTop: "8px" }}>
                  Deploy New Ballot
                </button>
              </div>
            )}
          </div>
          {isChairperson && !hasEnded && (
            <div
              style={{
                border: "1px solid #ccc",
                padding: "10px",
                marginTop: "16px",
              }}
            >
              <h3>Chairperson Controls</h3>
              <div style={{ marginBottom: "12px" }}>
                <input
                  type="text"
                  value={giveRightAddr}
                  onChange={(e) => setGiveRightAddr(e.target.value)}
                  placeholder="Address to give right"
                  style={{ width: "350px" }}
                />
                <button onClick={handleGiveRight} style={{ marginLeft: "8px" }}>
                  Give Right
                </button>
              </div>
              <div>
                <label>
                  Batch addresses (comma or space separated):
                  <br />
                  <textarea
                    value={batchGiveRight}
                    onChange={(e) => setBatchGiveRight(e.target.value)}
                    rows={3}
                    style={{ width: "100%", marginTop: "4px" }}
                    placeholder={`0xabc..., 0xdef..., 0x123...`}
                  />
                </label>
                <br />
                <button onClick={handleGiveRightBatch} style={{ marginTop: "6px" }}>
                  Give Right to Many
                </button>
              </div>
            </div>
          )}
          {!hasEnded && (
            <div style={{ border: "1px solid #ccc", padding: "10px", marginTop: "16px" }}>
              <h3>Delegate Vote</h3>
              <input
                type="text"
                value={delegateAddr}
                onChange={(e) => setDelegateAddr(e.target.value)}
                placeholder="Delegate to address"
                style={{ width: "350px" }}
              />
              <button onClick={handleDelegate}>Delegate</button>
            </div>
          )}
          <div
            style={{
              border: "1px solid #ccc",
              padding: "10px",
              marginTop: "16px",
            }}
          >
            <h3>Voter Status</h3>

            <div style={{ marginBottom: "8px" }}>
              <label>
                Address to inspect (leave blank for yourself):{" "}
                <input
                  type="text"
                  value={voterStatusAddr}
                  onChange={(e) => setVoterStatusAddr(e.target.value)}
                  placeholder={account}
                  style={{ width: "360px" }}
                />
              </label>
              <button
                onClick={() => loadVoterStatus()}
                style={{ marginLeft: "8px" }}
              >
                Load Voter Status
              </button>
            </div>
            {voterStatus && (
              <div style={{ fontSize: "14px", lineHeight: 1.6 }}>
                <p>
                  <strong>Address:</strong> {voterStatus.address}
                </p>
                <p>
                  <strong>Weight:</strong> {voterStatus.weight}
                </p>
                <p>
                  <strong>Has voted:</strong>{" "}
                  {voterStatus.voted ? "Yes" : "No"}
                </p>
                <p>
                  <strong>Delegate:</strong>{" "}
                  {voterStatus.delegate &&
                    voterStatus.delegate !==
                    "0x0000000000000000000000000000000000000000"
                    ? voterStatus.delegate
                    : "(none)"}
                </p>
                <p>
                  <strong>Voted for:</strong>{" "}
                  {voterStatus.voted
                    ? voterStatus.voteName
                      ? `#${voterStatus.voteIndex} – ${voterStatus.voteName}`
                      : `proposal #${voterStatus.voteIndex}`
                    : "(not voted yet)"}
                </p>
              </div>
            )}
          </div>
          <div style={{ border: "1px solid #ccc", padding: "10px", marginTop: "16px" }}>
            <h3>Proposals</h3>
            {proposals.map((p) => {
              const isWinning = winnerIndices.includes(p.index);
              return (
                <div
                  key={p.index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: "6px",
                    padding: "6px 8px",
                    borderRadius: "4px",
                    backgroundColor: isWinning ? "#e6ffe6" : "transparent",
                    border: isWinning ? "1px solid #2e7d32" : "1px solid transparent",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <strong>
                      #{p.index}: {p.name}
                    </strong>{" "}
                    — votes: {p.voteCount}
                    {isWinning && (
                      <span style={{ marginLeft: "8px", color: "#2e7d32", fontWeight: 600 }}>
                        (winner)
                      </span>
                    )}
                  </div>
                  <button onClick={() => handleVote(p.index)}>Vote</button>
                </div>
              );
            })}

          </div>
          {winnerNames.length > 0 && (
            <div
              style={{
                border: "2px solid green",
                padding: "10px",
                marginBottom: "16px",
              }}
            >
              <h3>
                {winnerNames.length === 1
                  ? "Current Winner"
                  : "Current Winners (tie)"}
              </h3>
              <ul style={{ fontSize: "18px", marginTop: "8px" }}>
                {winnerNames.map((name, idx) => (
                  <li key={idx}>{name}</li>
                ))}
              </ul>
            </div>
          )}
          <div
            style={{
              border: "1px solid #ccc",
              padding: "10px",
              marginTop: "16px",
              maxHeight: "200px",
              overflowY: "auto",
            }}
          >
            <h3>Event Log</h3>
            {events.length === 0 ? (
              <p>No events yet.</p>
            ) : (
              <ul style={{ paddingLeft: "20px" }}>
                {events.map((ev, idx) => (
                  <li key={idx} style={{ marginBottom: "6px", fontSize: "14px" }}>
                    {ev.type === "VoteCast" && (
                      <>
                        🗳️ <strong>Vote</strong> — voter {ev.voter} voted for proposal{" "}
                        #{ev.proposal} (weight {ev.weight}) <br />
                        <span style={{ fontSize: "12px", color: "#777" }}>
                          tx: {ev.txHash}
                        </span>
                      </>
                    )}

                    {ev.type === "RightGiven" && (
                      <>
                        ✅ <strong>Right Given</strong> — {ev.chair} gave right to{" "}
                        {ev.voter} <br />
                        <span style={{ fontSize: "12px", color: "#777" }}>
                          tx: {ev.txHash}
                        </span>
                      </>
                    )}

                    {ev.type === "Delegated" && (
                      <>
                        🤝 <strong>Delegated</strong> — {ev.from} delegated to {ev.to}{" "}
                        <br />
                        <span style={{ fontSize: "12px", color: "#777" }}>
                          tx: {ev.txHash}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div
            style={{
              border: "1px solid #ccc",
              padding: "10px",
              marginTop: "16px",
              maxHeight: "200px",
              overflowY: "auto",
            }}
          >
            <h3>Transaction History</h3>
            {txHistory.length === 0 ? (
              <p>No transactions yet.</p>
            ) : (
              <ul style={{ paddingLeft: "20px" }}>
                {txHistory.map((tx, idx) => (
                  <li key={idx} style={{ marginBottom: "6px", fontSize: "14px" }}>
                    <strong>[{tx.type}]</strong>{" "}
                    {tx.description}
                    <br />
                    <span style={{ fontSize: "12px", color: "#777" }}>
                      from: {tx.from} <br />
                      ballot: {tx.ballot} <br />
                      time: {tx.ts} <br />
                      tx: {tx.hash}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
