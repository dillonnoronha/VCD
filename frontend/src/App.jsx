// src/App.jsx
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import VotingHub from "./artifacts/VotingHubInterface.json";

// ✅ Your deployed VotingDiamond address
const DIAMOND_ADDRESS = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853";

const ALGORITHM_LABELS = {
  0: "OnePersonOneVote",
  1: "RankedChoice",
  2: "WeightedSplit",
};

const VOTE_STATUS = {
  0: "None",
  1: "Pending",
  2: "Confirmed",
};

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const [status, setStatus] = useState("");

  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [sessionMeta, setSessionMeta] = useState(null);

  const [options, setOptions] = useState([]);

  const [delegateTo, setDelegateTo] = useState("");
  const [purchaseEth, setPurchaseEth] = useState("");

  const [myVote, setMyVote] = useState(null);
  const [results, setResults] = useState(null);

  // -------- Wallet / contract --------

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask not found. Please install it.");
      return;
    }
    try {
      setConnecting(true);
      const _provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await _provider.send("eth_requestAccounts", []);
      const _signer = await _provider.getSigner();
      const _contract = new ethers.Contract(
        DIAMOND_ADDRESS,
        VotingHub.abi,
        _signer
      );

      setProvider(_provider);
      setSigner(_signer);
      setContract(_contract);
      setAccount(accounts[0]);
      setStatus("Wallet connected.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    if (!window.ethereum) return;
    const handler = (accounts) => {
      if (!accounts || accounts.length === 0) {
        setAccount(null);
        setContract(null);
        setSigner(null);
      } else {
        setAccount(accounts[0]);
      }
    };
    window.ethereum.on("accountsChanged", handler);
    return () => window.ethereum.removeListener("accountsChanged", handler);
  }, []);

  const ensureConnected = () => {
    if (!contract || !account) {
      setStatus("Connect your wallet first.");
      return false;
    }
    return true;
  };

  // -------- Sessions --------

  const loadSessions = async () => {
    if (!ensureConnected()) return;
    try {
      setStatus("Loading sessions...");
      const ids = await contract.listSessions();
      const data = [];
      for (const idBig of ids) {
        const id = Number(idBig);
        const meta = await contract.getSessionMeta(id);
        data.push({ id, name: meta[0] });
      }
      setSessions(data);
      setStatus("Sessions loaded.");
    } catch (err) {
      console.error(err);
      setStatus("Error loading sessions.");
    }
  };

  const loadSessionDetails = async (id) => {
    if (!ensureConnected()) return;
    try {
      setStatus("Loading session details...");
      const meta = await contract.getSessionMeta(id);
      const opts = await contract.getOptions(id);

      const session = {
        id,
        name: meta[0],
        startTime: Number(meta[1]),
        endTime: Number(meta[2]),
        revealTime: Number(meta[3]),
        algorithm: Number(meta[4]),
        allowAnonymous: meta[5],
        allowMultiVoteWithEth: meta[6],
        concealResults: meta[7],
        revealed: meta[8],
        optionCount: Number(meta[9]),
        pricePerWeight: meta[10],
      };
      setSessionMeta(session);

      const mapped = opts.map((o, idx) => ({
        index: idx,
        name: o.name ?? o[0],
        baseWeight: Number(o.weight ?? o[1]),
        inputWeight: "",
      }));
      setOptions(mapped);
      setSelectedSessionId(String(id));

      setStatus("Session loaded.");
    } catch (err) {
      console.error(err);
      setStatus("Error loading session details.");
    }
  };

  // -------- Voting --------

  const updateOptionInput = (idx, value) => {
    setOptions((prev) =>
      prev.map((o) => (o.index === idx ? { ...o, inputWeight: value } : o))
    );
  };

  const buildAllocationsFromInputs = () => {
    const allocs = [];
    for (const opt of options) {
      const wStr = (opt.inputWeight || "").trim();
      if (!wStr) continue;
      const wNum = BigInt(wStr);
      if (wNum > 0n) {
        allocs.push({
          optionId: BigInt(opt.index),
          weight: wNum,
        });
      }
    }
    return allocs;
  };

  const castVote = async (finalize) => {
    if (!ensureConnected()) return;
    if (!selectedSessionId) {
      setStatus("Select a session first.");
      return;
    }
    const sessionId = BigInt(selectedSessionId);
    const allocations = buildAllocationsFromInputs();
    if (allocations.length === 0) {
      setStatus("Enter at least one non-zero allocation.");
      return;
    }
    try {
      setStatus(finalize ? "Casting vote..." : "Preparing vote...");
      await (await contract.castVote(sessionId, allocations, finalize)).wait();
      setStatus(finalize ? "Vote cast." : "Vote prepared.");
      await refreshMyVote();
      await refreshResults();
    } catch (err) {
      console.error(err);
      setStatus("Error casting vote.");
    }
  };

  const revokeVote = async () => {
    if (!ensureConnected()) return;
    if (!selectedSessionId) {
      setStatus("Select a session first.");
      return;
    }
    try {
      setStatus("Revoking vote...");
      await (await contract.revokeVote(BigInt(selectedSessionId))).wait();
      setStatus("Vote revoked.");
      await refreshMyVote();
      await refreshResults();
    } catch (err) {
      console.error(err);
      setStatus("Error revoking vote.");
    }
  };

  const refreshMyVote = async () => {
    if (!ensureConnected()) return;
    if (!selectedSessionId) {
      setStatus("Select a session first.");
      return;
    }
    try {
      const res = await contract.getVoteAllocations(
        BigInt(selectedSessionId),
        account
      );
      const statusCode = Number(res[0]);
      const allocations = res[1].map((a) => ({
        optionId: Number(a.optionId ?? a[0]),
        weight: Number(a.weight ?? a[1]),
      }));
      const anonymousVote = res[2];
      const anonId = res[3];
      const usedWeight = Number(res[4]);
      setMyVote({ statusCode, allocations, anonymousVote, anonId, usedWeight });
      setStatus("Loaded your vote.");
    } catch (err) {
      console.error(err);
      setStatus("Error getting your vote.");
    }
  };

  // -------- Delegation / purchase --------

  const delegateVote = async () => {
    if (!ensureConnected()) return;
    if (!selectedSessionId) {
      setStatus("Select a session first.");
      return;
    }
    if (!delegateTo.trim()) {
      setStatus("Enter an address to delegate to.");
      return;
    }
    try {
      setStatus("Delegating vote...");
      await (
        await contract.delegateVote(
          BigInt(selectedSessionId),
          delegateTo.trim()
        )
      ).wait();
      setStatus("Delegation successful.");
    } catch (err) {
      console.error(err);
      setStatus("Error delegating.");
    }
  };

  const purchaseWeight = async () => {
    if (!ensureConnected()) return;
    if (!selectedSessionId) {
      setStatus("Select a session first.");
      return;
    }
    if (!purchaseEth.trim()) {
      setStatus("Enter ETH amount.");
      return;
    }
    try {
      const value = ethers.parseEther(purchaseEth.trim());
      setStatus("Purchasing extra weight...");
      await (
        await contract.purchaseWeight(BigInt(selectedSessionId), { value })
      ).wait();
      setStatus("Weight purchased.");
      await refreshMyVote();
      await refreshResults();
    } catch (err) {
      console.error(err);
      setStatus("Error purchasing weight.");
    }
  };

  // -------- Results --------

  const refreshResults = async () => {
    if (!ensureConnected()) return;
    if (!selectedSessionId) {
      setStatus("Select a session first.");
      return;
    }
    try {
      const canSee = await contract.canSeeResults(
        BigInt(selectedSessionId),
        account
      );
      if (!canSee) {
        setResults(null);
        setStatus("Results are concealed for this session.");
        return;
      }
      const totals = await contract.getOptionTotals(BigInt(selectedSessionId));
      const winners = await contract.getWinners(BigInt(selectedSessionId));
      const totalsArr = totals.map((t) => Number(t));
      const winnersArr = winners.map((w) => Number(w));
      setResults({ totals: totalsArr, winners: winnersArr });
      setStatus("Results refreshed.");
    } catch (err) {
      console.error(err);
      setStatus("Error loading results.");
    }
  };

  // -------- UI --------

  return (
    <div className="app-root">
      <header className="header">
        <div>
          <h1>VCD – Voting Diamond Dapp</h1>
          <p className="subtitle">
            Connect to your local Hardhat node (http://127.0.0.1:8545). Make
            sure VotingDiamond is deployed at <code>{DIAMOND_ADDRESS}</code>.
          </p>
        </div>

        <div className="wallet-panel">
          <button
            className="btn primary"
            onClick={connectWallet}
            disabled={connecting}
          >
            {account ? "Wallet Connected" : "Connect Wallet"}
          </button>
          <p className="wallet-text">
            {account
              ? `Account: ${account.slice(0, 6)}…${account.slice(-4)}`
              : "No wallet connected"}
          </p>
        </div>
      </header>

      <main className="main">
        {/* Sessions */}
        <section className="card">
          <div className="card-header-row">
            <h2>Sessions</h2>
            <button className="btn ghost" onClick={loadSessions}>
              Refresh Sessions
            </button>
          </div>

          <div className="row">
            <select
              className="input select"
              value={selectedSessionId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedSessionId(val);
                if (val) loadSessionDetails(Number(val));
              }}
            >
              <option value="">Select a session…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} – {s.name}
                </option>
              ))}
            </select>
          </div>

          {sessionMeta && (
            <div className="session-meta">
              <p>
                <strong>{sessionMeta.name}</strong>
              </p>
              <p className="muted">
                Algorithm:{" "}
                {ALGORITHM_LABELS[sessionMeta.algorithm] ??
                  sessionMeta.algorithm}
                {" • "}
                Anonymous allowed: {sessionMeta.allowAnonymous ? "Yes" : "No"}
                {" • "}
                Multi-vote with ETH:{" "}
                {sessionMeta.allowMultiVoteWithEth ? "Yes" : "No"}
              </p>
              <p className="muted">
                Options: {sessionMeta.optionCount} • Conceal results:{" "}
                {sessionMeta.concealResults ? "Yes" : "No"}
              </p>
            </div>
          )}
        </section>

        {/* Voting */}
        <section className="card">
          <h2>Cast / Update Vote</h2>
          {options.length === 0 ? (
            <p className="muted">
              Select a session to see its options and vote.
            </p>
          ) : (
            <>
              <div className="list">
                {options.map((opt) => (
                  <div key={opt.index} className="list-item">
                    <div>
                      <span className="badge">#{opt.index}</span>
                      <span className="item-title">{opt.name}</span>
                    </div>
                    <div className="vote-input">
                      <span className="muted small">Weight</span>
                      <input
                        type="number"
                        min="0"
                        className="input small-input"
                        value={opt.inputWeight}
                        onChange={(e) =>
                          updateOptionInput(opt.index, e.target.value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="row buttons-row">
                <button className="btn" onClick={() => castVote(false)}>
                  Prepare Vote (Pending)
                </button>
                <button className="btn primary" onClick={() => castVote(true)}>
                  Cast Vote (Finalize)
                </button>
                <button className="btn ghost" onClick={revokeVote}>
                  Revoke Vote
                </button>
                <button className="btn ghost" onClick={refreshMyVote}>
                  Refresh My Vote
                </button>
              </div>
            </>
          )}
        </section>

        {/* Delegation & purchase */}
        <section className="card">
          <h2>Delegation & Extra Weight</h2>
          <div className="row">
            <input
              className="input"
              placeholder="Delegate to address"
              value={delegateTo}
              onChange={(e) => setDelegateTo(e.target.value)}
            />
            <button className="btn" onClick={delegateVote}>
              Delegate Vote
            </button>
          </div>
          <div className="row row-spaced">
            <input
              className="input"
              placeholder="ETH to spend on extra weight (e.g. 0.01)"
              value={purchaseEth}
              onChange={(e) => setPurchaseEth(e.target.value)}
            />
            <button className="btn" onClick={purchaseWeight}>
              Purchase Weight
            </button>
          </div>
        </section>

        {/* My vote & results */}
        <section className="card">
          <div className="card-header-row">
            <h2>Your Vote & Results</h2>
            <button className="btn ghost" onClick={refreshResults}>
              Refresh Results
            </button>
          </div>

          {myVote ? (
            <div className="myvote">
              <p>
                <strong>Your vote status:</strong>{" "}
                {VOTE_STATUS[myVote.statusCode] ?? myVote.statusCode}
              </p>
              <p className="muted">
                Used weight: {myVote.usedWeight} • Anonymous:{" "}
                {myVote.anonymousVote ? "Yes" : "No"}
              </p>
              {myVote.allocations.length > 0 && (
                <ul className="small-list">
                  {myVote.allocations.map((a, i) => (
                    <li key={i}>
                      Option #{a.optionId}: {a.weight}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="muted">
              No vote loaded yet. Click “Refresh My Vote” after casting.
            </p>
          )}

          {results ? (
            <div className="results">
              <p>
                <strong>Option totals:</strong>
              </p>
              <ul className="small-list">
                {results.totals.map((t, i) => (
                  <li key={i}>
                    Option #{i}: {t}
                    {results.winners.includes(i) ? " 🏆" : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted">
              Results not available or concealed for this session.
            </p>
          )}
        </section>

        <p className="status-text">{status}</p>
        <p className="tip">
          Tip: Only the contract owner can create sessions and reveal results.
          This UI focuses on interacting with sessions that already exist.
        </p>
      </main>
    </div>
  );
}

export default App;
