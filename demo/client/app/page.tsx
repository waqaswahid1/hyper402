"use client";

import { useState, useEffect } from "react";
import { 
  useCurrentUser,
  useIsSignedIn,
  useSignInWithEmail,
  useVerifyEmailOTP,
  useSignInWithSms,
  useVerifySmsOTP,
  useSignInWithOAuth,
  useSignOut
} from "@coinbase/cdp-hooks";
import { toViemAccount } from "@coinbase/cdp-core";
import { createWalletClient, http, publicActions } from "viem";
import { makePaidRequest } from "./hyper402-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";

type ChainConfig = {
  network: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  blockExplorer?: string;
  faucetUrl?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  token: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    version: string;
  };
};

interface ApiResponse {
  quote: string;
  timestamp: string;
  paid: boolean;
}

interface PaymentResponse {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  blockExplorer?: string;
}

export default function Home() {
  const { currentUser } = useCurrentUser();
  const { isSignedIn } = useIsSignedIn();
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { signInWithSms } = useSignInWithSms();
  const { verifySmsOTP } = useVerifySmsOTP();
  const { signInWithOAuth } = useSignInWithOAuth();
  const { signOut } = useSignOut();
  
  const [quote, setQuote] = useState<string>("");
  const [paymentInfo, setPaymentInfo] = useState<PaymentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [balance, setBalance] = useState<string>("0");
  const [showAuthMethods, setShowAuthMethods] = useState(false);
  const [authStep, setAuthStep] = useState<"method" | "email" | "sms" | "otp">("method");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [flowId, setFlowId] = useState("");
  const [authType, setAuthType] = useState<"email" | "sms">("email");
  const [copied, setCopied] = useState(false);
  const [chainConfigs, setChainConfigs] = useState<ChainConfig[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");
  const [chainLoading, setChainLoading] = useState(true);
  const [chainError, setChainError] = useState<string>("");

  const address = currentUser?.evmAccounts?.[0];
  const selectedChain = chainConfigs.find((chain) => chain.network === selectedNetwork) || null;

  useEffect(() => {
    async function loadChains() {
      try {
        setChainLoading(true);
        const response = await fetch(`${API_URL}/chains`);
        if (!response.ok) {
          throw new Error("failed to load chain configs");
        }
        const data = await response.json();
        setChainConfigs(data.chains || []);
        if (data.defaultNetwork && (data.chains || []).some((chain: ChainConfig) => chain.network === data.defaultNetwork)) {
          setSelectedNetwork(data.defaultNetwork);
        } else if ((data.chains || []).length > 0) {
          setSelectedNetwork(data.chains[0].network);
        }
      } catch (err) {
        setChainError(err instanceof Error ? err.message : "failed to load chains");
      } finally {
        setChainLoading(false);
      }
    }

    loadChains();
  }, []);

  // fetch balance when connected
  useEffect(() => {
    if (address && selectedChain) {
      fetchBalance();
    }
  }, [address, selectedChain]);

  const fetchBalance = async () => {
    if (!address || !selectedChain) return;
    
    try {
      const response = await fetch(`${API_URL}/balance/${address}?network=${selectedChain.network}`);
      
      if (!response.ok) {
        throw new Error("failed to fetch balance");
      }
      
      const data = await response.json();
      setBalance(data.balance);
      console.log(`balance updated: ${data.balance} ${selectedChain.token.symbol} for ${address} on ${selectedChain.network}`);
    } catch (err) {
      console.error("error fetching balance:", err);
    }
  };

  // handle email sign in
  const handleEmailSignIn = async () => {
    if (!emailOrPhone) return;
    
    setLoading(true);
    setError("");
    
    try {
      const result = await signInWithEmail({ email: emailOrPhone });
      setFlowId(result.flowId);
      setAuthType("email");
      setAuthStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to send email");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // handle mobile SMS sign in
  const handleSmsSignIn = async () => {
    if (!emailOrPhone) return;
    
    setLoading(true);
    setError("");
    
    try {
      const result = await signInWithSms({ phoneNumber: emailOrPhone });
      setFlowId(result.flowId);
      setAuthType("sms");
      setAuthStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to send SMS");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // verify OTP
  const handleVerifyOtp = async () => {
    if (!otp || !flowId) return;
    
    setLoading(true);
    setError("");
    
    try {
      if (authType === "email") {
        await verifyEmailOTP({ flowId, otp });
      } else {
        await verifySmsOTP({ flowId, otp });
      }
      // user now authenticated; reset state
      setShowAuthMethods(false);
      setAuthStep("method");
      setEmailOrPhone("");
      setOtp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to verify OTP");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // handle OAuth sign in
  const handleOAuthSignIn = async (provider: "google" | "x") => {
    setLoading(true);
    setError("");
    
    try {
      await signInWithOAuth(provider);
      setShowAuthMethods(false);
      setAuthStep("method");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to sign in");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // call the x402-enabled API endpoint
  const handleCallApi = async (endpoint: string) => {
    if (!address || !currentUser) return;
    if (!selectedChain) {
      setError("select a network before calling the API");
      return;
    }
    
    setLoading(true);
    setError("");
    setQuote("");
    setPaymentInfo(null);
    
    try {
      // convert CDP Embedded Wallet to viem account
      const evmAddress = currentUser.evmAccounts?.[0];
      if (!evmAddress) {
        throw new Error("no EVM account found");
      }
      
      const viemAccount = await toViemAccount(evmAddress as `0x${string}`);
      const viemChain = {
        id: selectedChain.chainId,
        name: selectedChain.name,
        nativeCurrency: selectedChain.nativeCurrency,
        rpcUrls: {
          default: { http: [selectedChain.rpcUrl] },
          public: { http: [selectedChain.rpcUrl] },
        },
        blockExplorers: selectedChain.blockExplorer
          ? { default: { name: `${selectedChain.name} Explorer`, url: selectedChain.blockExplorer } }
          : undefined,
      };
      const walletClient = createWalletClient({
        account: viemAccount,
        chain: viemChain,
        transport: http(selectedChain.rpcUrl),
      }).extend(publicActions);
      
      // Make paid request using custom Hyper402 client
      const result = await makePaidRequest(`${API_URL}${endpoint}`, walletClient, evmAddress, {
        network: selectedChain.network,
      });
      
      setQuote(result.data.quote || result.data.fortune || "Success!");
      if (result.paymentInfo) {
        setPaymentInfo(result.paymentInfo);
      }
      
      setTimeout(fetchBalance, 2000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to call API");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const tokenSymbol = selectedChain?.token.symbol || "token";
  const explorerUrl = paymentInfo?.transaction
    ? (() => {
        const base = paymentInfo.blockExplorer || selectedChain?.blockExplorer;
        if (!base) return null;
        return `${base.replace(/\/$/, "")}/tx/${paymentInfo.transaction}`;
      })()
    : null;

  return (
    <div className="container">
      <div className="header">
        <h1>Hyper402 demo</h1>
        <p>multi-chain x402 facilitator on any EIP-3009 EVM</p>
      </div>

      <div className="wallet-section">
        <h2 style={{ marginBottom: "16px", fontSize: "20px" }}>choose network</h2>
        {chainLoading ? (
          <p style={{ fontSize: "14px", color: "#666" }}>loading networks…</p>
        ) : chainConfigs.length === 0 ? (
          <div className="info-box">
            no networks configured. set <code>CHAIN_CONFIGS</code> on the server & facilitator.
          </div>
        ) : (
          <>
            <select
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #ddd",
                marginBottom: "12px",
              }}
            >
              {chainConfigs.map((chain) => (
                <option key={chain.network} value={chain.network}>
                  {chain.name} ({chain.token.symbol})
                </option>
              ))}
            </select>
            {selectedChain && (
              <div style={{ fontSize: "14px", color: "#555", lineHeight: 1.6 }}>
                <p>
                  chain id: <strong>{selectedChain.chainId}</strong> · token:{" "}
                  <strong>{selectedChain.token.symbol}</strong>
                </p>
                <p style={{ wordBreak: "break-all" }}>
                  token contract: <code>{selectedChain.token.address}</code>
                </p>
                {selectedChain.faucetUrl && (
                  <button
                    className="button button-secondary"
                    onClick={() => window.open(selectedChain.faucetUrl, "_blank")}
                    style={{ marginTop: "12px" }}
                  >
                    open faucet →
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {chainError && (
          <div className="error" style={{ marginTop: "12px" }}>
            <strong>network error:</strong> {chainError}
          </div>
        )}
      </div>

      <div className="wallet-section">
        <h2 style={{ marginBottom: "16px", fontSize: "20px" }}>sign in</h2>
        
        {!isSignedIn ? (
          <>
            {!showAuthMethods ? (
              <button 
                className="button button-primary"
                onClick={() => setShowAuthMethods(true)}
                disabled={loading}
              >
                sign in
              </button>
            ) : authStep === "method" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <button
                  className="button button-primary"
                  onClick={() => setAuthStep("email")}
                  disabled={loading}
                >
                  email
                </button>
                <button
                  className="button button-primary"
                  onClick={() => setAuthStep("sms")}
                  disabled={loading}
                >
                  mobile
                </button>
                <button
                  className="button button-primary"
                  onClick={() => handleOAuthSignIn("google")}
                  disabled={loading}
                >
                  google
                </button>
                <button
                  className="button button-primary"
                  onClick={() => handleOAuthSignIn("x")}
                  disabled={loading}
                >
                  X
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => setShowAuthMethods(false)}
                  disabled={loading}
                >
                  cancel
                </button>
              </div>
            ) : authStep === "email" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="email"
                  placeholder="enter your email"
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ddd" }}
                />
                <button
                  className="button button-primary"
                  onClick={handleEmailSignIn}
                  disabled={loading || !emailOrPhone}
                >
                  {loading ? "sending..." : "send OTP"}
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => { setAuthStep("method"); setEmailOrPhone(""); }}
                  disabled={loading}
                >
                  back
                </button>
              </div>
            ) : authStep === "sms" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  type="tel"
                  placeholder="Enter phone (+1234567890)"
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ddd" }}
                />
                <button
                  className="button button-primary"
                  onClick={handleSmsSignIn}
                  disabled={loading || !emailOrPhone}
                >
                  {loading ? "sending..." : "send OTP"}
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => { setAuthStep("method"); setEmailOrPhone(""); }}
                  disabled={loading}
                >
                  back
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
                  enter the 6-digit code sent to {emailOrPhone}
                </p>
                <input
                  type="text"
                  placeholder="Enter OTP code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                  style={{ padding: "12px", borderRadius: "8px", border: "1px solid #ddd" }}
                />
                <button
                  className="button button-primary"
                  onClick={handleVerifyOtp}
                  disabled={loading || !otp}
                >
                  {loading ? "verifying..." : "verify OTP"}
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => { setAuthStep("method"); setEmailOrPhone(""); setOtp(""); }}
                  disabled={loading}
                >
                  back
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="wallet-info">
            <p>connected:</p>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "16px" }}>
              <div className="address" style={{ flex: 1 }}>{address}</div>
              <button
                className="button button-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(address || "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                style={{ 
                  padding: "8px 16px", 
                  margin: 0, 
                  width: "auto", 
                  fontSize: "14px",
                  background: copied ? "#d4edda" : "#f0f0f0",
                  color: copied ? "#155724" : "#333"
                }}
              >
                {copied ? "copied ✓" : "copy"}
              </button>
            </div>
            <p>{tokenSymbol} balance:</p>
            <div className="balance">
              {balance} {tokenSymbol}
            </div>
            <button 
              className="button button-secondary" 
              onClick={() => signOut()}
              style={{ marginTop: "16px" }}
            >
              sign out
            </button>
          </div>
        )}
      </div>

      {isSignedIn && (
        <>
          <div className="action-section">
            <h2 style={{ marginBottom: "16px", fontSize: "20px" }}>
              get {tokenSymbol} on {selectedChain?.name || "your testnet"}
            </h2>
            
            <button
              className="button button-primary"
              onClick={() => selectedChain?.faucetUrl && window.open(selectedChain.faucetUrl, "_blank")}
              disabled={!selectedChain?.faucetUrl}
              style={{ marginBottom: "8px" }}
            >
              {selectedChain?.faucetUrl ? "open faucet →" : "add faucet url via CHAIN_CONFIGS"}
            </button>
            <p style={{ fontSize: "13px", color: "#666", lineHeight: "1.5" }}>
              1. copy your address from section 1 above<br />
              2. open the faucet for {selectedChain?.name || "the selected network"}<br />
              3. request {tokenSymbol} and wait for confirmation<br />
              4. return here and refresh balance
            </p>
          </div>

          <div className="action-section">
            <h2 style={{ marginBottom: "16px", fontSize: "20px" }}>call x402-enabled API</h2>
            <button
              className="button button-primary"
              onClick={() => handleCallApi('/motivate')}
              disabled={loading || parseFloat(balance) < 0.01}
              style={{ marginBottom: "12px" }}
            >
              {loading ? "processing..." : `motivational quote (0.01 ${tokenSymbol})`}
            </button>
            <button
              className="button button-primary"
              onClick={() => handleCallApi('/fortune')}
              disabled={loading || parseFloat(balance) < 0.05}
            >
              {loading ? "processing..." : `fortune telling (0.05 ${tokenSymbol})`}
            </button>
            {parseFloat(balance) < 0.01 && (
              <div className="info-box">
                you need at least 0.01 {tokenSymbol} to call these APIs - use the faucet above
              </div>
            )}
          </div>

          {error && (
            <div className="error">
              <strong>error:</strong> {error}
            </div>
          )}

          {quote && (
            <div className="response-section">
              <h3>response:</h3>
              <div className="quote-display">"{quote}"</div>
              
              {paymentInfo && paymentInfo.transaction && (
                <div style={{ marginTop: "16px", textAlign: "center" }}>
                  {explorerUrl ? (
                    <a 
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-secondary"
                      style={{ display: "inline-block", textDecoration: "none" }}
                    >
                      view transaction on explorer →
                    </a>
                  ) : (
                    <div className="info-box">
                      explorer link unavailable - tx hash below
                    </div>
                  )}
                  <p style={{ fontSize: "12px", color: "#666", marginTop: "8px", fontFamily: "monospace" }}>
                    {paymentInfo.transaction.slice(0, 10)}...{paymentInfo.transaction.slice(-8)}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="steps" style={{ marginTop: "32px" }}>
        <h3>about this demo:</h3>
        <p style={{ fontSize: "14px", lineHeight: "1.6", color: "#666" }}>
          this demo showcases <strong>Hyper402</strong> - a configurable x402 payment facilitator for any EVM chain with EIP-3009 USDC
        </p>
        <ul style={{ fontSize: "14px", lineHeight: "1.8", color: "#666", marginTop: "12px", paddingLeft: "20px" }}>
          <li>sign in to get a CDP Embedded Wallet</li>
          <li>pick your preferred EVM testnet & faucet the matching token</li>
          <li>call x402-enabled APIs with automatic payment settlement</li>
          <li>no gas fees - Hyper402 facilitator sponsors gas via server wallets</li>
        </ul>
        <p style={{ fontSize: "13px", marginTop: "16px", color: "#888", textAlign: "center" }}>
          originally built for the HyperEVM Hackathon at Devconnect Buenos Aires, now extended for any chain
          <br />
          <a href="https://github.com/jnix2007/hyper402" target="_blank" rel="noopener noreferrer" style={{ color: "#0052ff", marginTop: "4px", display: "inline-block" }}>GitHub →</a>
        </p>
      </div>
    </div>
  );
}
