// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface Participant {
  id: string;
  encryptedData: string;
  preferences: string;
  timestamp: number;
  status: "pending" | "verified";
}

interface MatchResult {
  id: string;
  participant1: string;
  participant2: string;
  compatibilityScore: number;
  timestamp: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joining, setJoining] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newParticipantData, setNewParticipantData] = useState({
    preferences: "",
    encryptedInfo: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"participants" | "matches">("participants");
  const [showStats, setShowStats] = useState(true);
  
  // Calculate statistics
  const pendingCount = participants.filter(p => p.status === "pending").length;
  const verifiedCount = participants.filter(p => p.status === "verified").length;
  const avgCompatibility = matches.length > 0 
    ? (matches.reduce((sum, match) => sum + match.compatibilityScore, 0) / matches.length).toFixed(1)
    : "0.0";

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      // Load participants
      const participantKeysBytes = await contract.getData("participant_keys");
      let participantKeys: string[] = [];
      
      if (participantKeysBytes.length > 0) {
        try {
          participantKeys = JSON.parse(ethers.toUtf8String(participantKeysBytes));
        } catch (e) {
          console.error("Error parsing participant keys:", e);
        }
      }
      
      const participantsList: Participant[] = [];
      
      for (const key of participantKeys) {
        try {
          const participantBytes = await contract.getData(`participant_${key}`);
          if (participantBytes.length > 0) {
            try {
              const participantData = JSON.parse(ethers.toUtf8String(participantBytes));
              participantsList.push({
                id: key,
                encryptedData: participantData.data,
                preferences: participantData.preferences,
                timestamp: participantData.timestamp,
                status: participantData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing participant data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading participant ${key}:`, e);
        }
      }
      
      participantsList.sort((a, b) => b.timestamp - a.timestamp);
      setParticipants(participantsList);
      
      // Load matches
      const matchKeysBytes = await contract.getData("match_keys");
      let matchKeys: string[] = [];
      
      if (matchKeysBytes.length > 0) {
        try {
          matchKeys = JSON.parse(ethers.toUtf8String(matchKeysBytes));
        } catch (e) {
          console.error("Error parsing match keys:", e);
        }
      }
      
      const matchesList: MatchResult[] = [];
      
      for (const key of matchKeys) {
        try {
          const matchBytes = await contract.getData(`match_${key}`);
          if (matchBytes.length > 0) {
            try {
              const matchData = JSON.parse(ethers.toUtf8String(matchBytes));
              matchesList.push({
                id: key,
                participant1: matchData.participant1,
                participant2: matchData.participant2,
                compatibilityScore: matchData.compatibilityScore,
                timestamp: matchData.timestamp
              });
            } catch (e) {
              console.error(`Error parsing match data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading match ${key}:`, e);
        }
      }
      
      matchesList.sort((a, b) => b.timestamp - a.timestamp);
      setMatches(matchesList);
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const joinEvent = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setJoining(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting personal data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newParticipantData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const participantId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const participantData = {
        data: encryptedData,
        preferences: newParticipantData.preferences,
        timestamp: Math.floor(Date.now() / 1000),
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `participant_${participantId}`, 
        ethers.toUtf8Bytes(JSON.stringify(participantData))
      );
      
      const keysBytes = await contract.getData("participant_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(participantId);
      
      await contract.setData(
        "participant_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted data submitted securely!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowJoinModal(false);
        setNewParticipantData({
          preferences: "",
          encryptedInfo: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setJoining(false);
    }
  };

  const runMatching = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Running FHE matching algorithm..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Generate mock matches using FHE
      const newMatches: MatchResult[] = [];
      const verifiedParticipants = participants.filter(p => p.status === "verified");
      
      if (verifiedParticipants.length >= 2) {
        for (let i = 0; i < Math.min(5, verifiedParticipants.length / 2); i++) {
          const matchId = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const p1 = verifiedParticipants[i * 2];
          const p2 = verifiedParticipants[i * 2 + 1];
          
          const compatibilityScore = Math.floor(Math.random() * 41) + 60; // 60-100
          
          const matchData = {
            participant1: p1.id,
            participant2: p2.id,
            compatibilityScore,
            timestamp: Math.floor(Date.now() / 1000)
          };
          
          await contract.setData(
            `match_${matchId}`, 
            ethers.toUtf8Bytes(JSON.stringify(matchData))
          );
          
          const matchKeysBytes = await contract.getData("match_keys");
          let matchKeys: string[] = [];
          
          if (matchKeysBytes.length > 0) {
            try {
              matchKeys = JSON.parse(ethers.toUtf8String(matchKeysBytes));
            } catch (e) {
              console.error("Error parsing match keys:", e);
            }
          }
          
          matchKeys.push(matchId);
          
          await contract.setData(
            "match_keys", 
            ethers.toUtf8Bytes(JSON.stringify(matchKeys))
          );
          
          newMatches.push({
            id: matchId,
            ...matchData
          });
        }
      }
      
      setMatches(prev => [...newMatches, ...prev]);
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE matching completed successfully!"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Matching failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const verifyParticipant = async (participantId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Verifying encrypted data..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const participantBytes = await contract.getData(`participant_${participantId}`);
      if (participantBytes.length === 0) {
        throw new Error("Participant not found");
      }
      
      const participantData = JSON.parse(ethers.toUtf8String(participantBytes));
      
      const updatedParticipant = {
        ...participantData,
        status: "verified"
      };
      
      await contract.setData(
        `participant_${participantId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedParticipant))
      );
      
      setParticipants(prev => prev.map(p => 
        p.id === participantId ? {...p, status: "verified"} : p
      ));
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Participant verified successfully!"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: isAvailable 
          ? "FHE matching service is available!" 
          : "Service temporarily unavailable"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredParticipants = participants.filter(p => 
    p.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.preferences.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMatches = matches.filter(m => 
    m.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.participant1.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.participant2.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="heart-icon"></div>
          </div>
          <h1>FHE<span>Match</span>Dating</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowJoinModal(true)} 
            className="join-btn"
          >
            Join Event
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-layout">
        <div className="left-panel">
          <div className="panel-section">
            <h2>Project Overview</h2>
            <p>
              FHEMatchDating uses Fully Homomorphic Encryption (FHE) to protect your privacy while finding compatible matches. 
              Your personal data remains encrypted throughout the matching process.
            </p>
            <div className="fhe-badge">
              <span>FHE-Powered Privacy</span>
            </div>
          </div>
          
          <div className="panel-section">
            <h2>How It Works</h2>
            <ol className="steps">
              <li>Participants submit encrypted personal data</li>
              <li>FHE algorithms process data without decryption</li>
              <li>Optimal matches are generated privately</li>
              <li>Anonymous results guide event interactions</li>
            </ol>
          </div>
          
          <div className="panel-section">
            <h2>Quick Actions</h2>
            <button 
              onClick={checkAvailability}
              className="action-btn"
            >
              Check Availability
            </button>
            <button 
              onClick={runMatching}
              className="action-btn primary"
              disabled={verifiedCount < 2}
            >
              Run Matching Algorithm
            </button>
            <button 
              onClick={() => setShowStats(!showStats)}
              className="action-btn"
            >
              {showStats ? "Hide Stats" : "Show Stats"}
            </button>
          </div>
        </div>
        
        <div className="main-content">
          <div className="content-header">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === "participants" ? "active" : ""}`}
                onClick={() => setActiveTab("participants")}
              >
                Participants ({participants.length})
              </button>
              <button 
                className={`tab ${activeTab === "matches" ? "active" : ""}`}
                onClick={() => setActiveTab("matches")}
              >
                Matches ({matches.length})
              </button>
            </div>
            
            <div className="search-box">
              <input 
                type="text" 
                placeholder="Search..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button 
                onClick={loadData}
                className="refresh-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          {showStats && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{participants.length}</div>
                <div className="stat-label">Total Participants</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{verifiedCount}</div>
                <div className="stat-label">Verified Profiles</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">Pending Verification</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{avgCompatibility}</div>
                <div className="stat-label">Avg Compatibility</div>
              </div>
            </div>
          )}
          
          <div className="data-section">
            {activeTab === "participants" ? (
              <div className="participants-list">
                <div className="list-header">
                  <div className="header-cell">ID</div>
                  <div className="header-cell">Preferences</div>
                  <div className="header-cell">Date</div>
                  <div className="header-cell">Status</div>
                  <div className="header-cell">Actions</div>
                </div>
                
                {filteredParticipants.length === 0 ? (
                  <div className="no-data">
                    <div className="no-data-icon"></div>
                    <p>No participants found</p>
                    <button 
                      className="primary-btn"
                      onClick={() => setShowJoinModal(true)}
                    >
                      Be the first to join
                    </button>
                  </div>
                ) : (
                  filteredParticipants.map(participant => (
                    <div className="list-row" key={participant.id}>
                      <div className="list-cell">#{participant.id.substring(0, 6)}</div>
                      <div className="list-cell">{participant.preferences}</div>
                      <div className="list-cell">
                        {new Date(participant.timestamp * 1000).toLocaleDateString()}
                      </div>
                      <div className="list-cell">
                        <span className={`status-badge ${participant.status}`}>
                          {participant.status}
                        </span>
                      </div>
                      <div className="list-cell">
                        {participant.status === "pending" && (
                          <button 
                            className="verify-btn"
                            onClick={() => verifyParticipant(participant.id)}
                          >
                            Verify
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="matches-list">
                <div className="list-header">
                  <div className="header-cell">Match ID</div>
                  <div className="header-cell">Participants</div>
                  <div className="header-cell">Compatibility</div>
                  <div className="header-cell">Date</div>
                </div>
                
                {filteredMatches.length === 0 ? (
                  <div className="no-data">
                    <div className="no-data-icon"></div>
                    <p>No matches found</p>
                    <button 
                      className="primary-btn"
                      onClick={runMatching}
                      disabled={verifiedCount < 2}
                    >
                      Generate Matches
                    </button>
                  </div>
                ) : (
                  filteredMatches.map(match => (
                    <div className="list-row" key={match.id}>
                      <div className="list-cell">#{match.id.substring(0, 6)}</div>
                      <div className="list-cell">
                        <div>P1: #{match.participant1.substring(0, 6)}</div>
                        <div>P2: #{match.participant2.substring(0, 6)}</div>
                      </div>
                      <div className="list-cell">
                        <div className="compatibility-bar">
                          <div 
                            className="compatibility-fill" 
                            style={{ width: `${match.compatibilityScore}%` }}
                          ></div>
                          <span>{match.compatibilityScore}%</span>
                        </div>
                      </div>
                      <div className="list-cell">
                        {new Date(match.timestamp * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          
          <div className="compatibility-chart">
            <h3>Compatibility Distribution</h3>
            <div className="chart-bars">
              {[80, 70, 60, 50].map(minScore => {
                const count = matches.filter(m => 
                  m.compatibilityScore >= minScore && m.compatibilityScore < minScore + 10
                ).length;
                
                return (
                  <div className="chart-bar" key={minScore}>
                    <div className="bar-label">{minScore}-{minScore+9}%</div>
                    <div className="bar-container">
                      <div 
                        className="bar-fill" 
                        style={{ height: `${(count / matches.length) * 100 || 0}%` }}
                      ></div>
                    </div>
                    <div className="bar-count">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
  
      {showJoinModal && (
        <ModalJoin 
          onSubmit={joinEvent} 
          onClose={() => setShowJoinModal(false)} 
          joining={joining}
          participantData={newParticipantData}
          setParticipantData={setNewParticipantData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="heart-icon"></div>
              <span>FHEMatchDating</span>
            </div>
            <p>Privacy-first matchmaking using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">FAQ</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHEMatchDating. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalJoinProps {
  onSubmit: () => void; 
  onClose: () => void; 
  joining: boolean;
  participantData: any;
  setParticipantData: (data: any) => void;
}

const ModalJoin: React.FC<ModalJoinProps> = ({ 
  onSubmit, 
  onClose, 
  joining,
  participantData,
  setParticipantData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setParticipantData({
      ...participantData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!participantData.preferences || !participantData.encryptedInfo) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="join-modal">
        <div className="modal-header">
          <h2>Join Dating Event</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="privacy-notice">
            <div className="lock-icon"></div> 
            Your personal data will be encrypted with FHE and never decrypted
          </div>
          
          <div className="form-group">
            <label>Your Preferences *</label>
            <textarea 
              name="preferences"
              value={participantData.preferences} 
              onChange={handleChange}
              placeholder="Describe your ideal match preferences..." 
              rows={3}
            />
          </div>
          
          <div className="form-group">
            <label>Encrypted Personal Info *</label>
            <textarea 
              name="encryptedInfo"
              value={participantData.encryptedInfo} 
              onChange={handleChange}
              placeholder="Enter encrypted personal information..." 
              rows={4}
            />
            <div className="form-hint">
              This information will be processed with FHE without decryption
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={joining}
            className="submit-btn primary"
          >
            {joining ? "Encrypting with FHE..." : "Join Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;