import express from "express";
import cors from "cors";
import { createPublicClient, http } from "viem";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

// parse JSON bodies
app.use(express.json());

// enable CORS with custom headers
app.use(cors({
  exposedHeaders: ["X-PAYMENT-RESPONSE"],
  allowedHeaders: ["Content-Type", "X-PAYMENT", "X-CHAIN-NETWORK"],
}));

// your wallet address that will receive payments
const RECEIVER_WALLET = process.env.RECEIVER_WALLET || "0xYourWalletAddress";
const FACILITATOR_URL = process.env.HYPER402_FACILITATOR_URL || "http://localhost:3002";

const DEFAULT_CHAIN_CONFIGS = [
  {
    network: "polygon-amoy",
    chainId: 80002,
    name: "Polygon Amoy",
    rpcUrl: process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
    blockExplorer: "https://amoy.polygonscan.com",
    faucetUrl: "https://www.alchemy.com/faucets/polygon-amoy",
    nativeCurrency: { name: "Polygon", symbol: "POL", decimals: 18 },
    token: {
      address: process.env.POLYGON_AMOY_USDC_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000",
      name: "USDC",
      symbol: "USDC",
      decimals: 6,
      version: "2"
    }
  },
  {
    network: "hyperevm-testnet",
    chainId: 998,
    name: "HyperEVM Testnet",
    rpcUrl: process.env.HYPEREVM_RPC_URL || "https://rpc.hyperliquid-testnet.xyz/evm",
    blockExplorer: "https://testnet.purrsec.com",
    faucetUrl: "https://faucet.circle.com/",
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
    token: {
      address: process.env.USDC_CONTRACT_ADDRESS || "0x2B3370eE501B4a559b57D449569354196457D8Ab",
      name: "USDC",
      symbol: "USDC",
      decimals: 6,
      version: "2"
    }
  }
];

function parseChainConfigs() {
  const envConfig = process.env.CHAIN_CONFIGS;

  if (!envConfig) {
    return DEFAULT_CHAIN_CONFIGS;
  }

  try {
    const parsed = JSON.parse(envConfig);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("CHAIN_CONFIGS must be a non-empty array");
    }

    return parsed.map((config) => ({
      ...config,
      nativeCurrency: config.nativeCurrency || { name: "Native", symbol: "ETH", decimals: 18 },
      token: {
        ...config.token,
        address: config.token.address,
        name: config.token.name || "USDC",
        symbol: config.token.symbol || "USDC",
        version: config.token.version || "2",
        decimals: Number(config.token.decimals ?? 6)
      }
    }));
  } catch (error) {
    console.warn("[Hyper402 Demo] Failed to parse CHAIN_CONFIGS, falling back to defaults:", error);
    return DEFAULT_CHAIN_CONFIGS;
  }
}

let chainConfigs = parseChainConfigs();
const DEFAULT_NETWORK = process.env.DEFAULT_NETWORK || "polygon-amoy";

function getChainConfig(network = DEFAULT_NETWORK) {
  return chainConfigs.find((config) => config.network === network) || chainConfigs[0];
}

function buildPaymentRequirement(chain, config, req) {
  const resource = `${req.protocol}://${req.headers.host}${req.path}`;

  return {
    scheme: "exact",
    network: chain.network,
    maxAmountRequired: config.amount,
    asset: chain.token.address,
    payTo: RECEIVER_WALLET,
    resource,
    description: config.description,
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
    extra: {
      tokenName: chain.token.name,
      tokenVersion: chain.token.version,
      tokenDecimals: chain.token.decimals,
      chainId: chain.chainId,
      rpcUrl: chain.rpcUrl,
      blockExplorer: chain.blockExplorer,
      faucetUrl: chain.faucetUrl,
      nativeCurrency: chain.nativeCurrency.symbol
    }
  };
}

// payment config for each endpoint
const PAYMENT_CONFIG = {
  "/motivate": {
    amount: "10000", // 0.01 USDC
    description: "Get a motivational quote"
  },
  "/fortune": {
    amount: "50000", // 0.05 USDC
    description: "Get your fortune told"
  }
};

// x402 payment middleware for configurable EVM chains
async function x402Middleware(req, res, next) {
  const config = PAYMENT_CONFIG[req.path];
  
  if (!config) {
    return next(); // not an x402-enabled endpoint
  }

  const requestedNetwork = req.headers["x-chain-network"] || req.query.network || DEFAULT_NETWORK;
  const chainConfig = getChainConfig(requestedNetwork);
  req.chainConfig = chainConfig;

  const paymentHeader = req.headers['x-payment'];
  
  // if no payment header, return 402
  if (!paymentHeader) {
    const paymentRequirement = buildPaymentRequirement(chainConfig, config, req);

    return res.status(402).json({
      accepts: [paymentRequirement]
    });
  }

  // payment provided, verify & settle
  try {
    const paymentPayload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
    
    const paymentRequirements = buildPaymentRequirement(chainConfig, config, req);

    // verify with facilitator
    const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload,
        paymentRequirements
      })
    });

    const verifyResult = await verifyResponse.json();

    if (!verifyResult.isValid) {
      return res.status(402).json({
        error: "Invalid payment",
        reason: verifyResult.invalidReason
      });
    }

    // settle with facilitator
    const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload,
        paymentRequirements
      })
    });

    const settleResult = await settleResponse.json();

    if (!settleResult.success) {
      return res.status(500).json({
        error: "Settlement failed",
        reason: settleResult.errorReason
      });
    }

    // add payment response header
    const paymentResponse = Buffer.from(JSON.stringify({
      success: true,
      transaction: settleResult.transaction,
      network: chainConfig.network,
      blockExplorer: chainConfig.blockExplorer,
      payer: settleResult.payer
    })).toString('base64');

    res.setHeader('X-PAYMENT-RESPONSE', paymentResponse);

    // payment successful, continue to endpoint
    next();

  } catch (error) {
    console.error("Payment processing error:", error);
    res.status(500).json({ error: "Payment processing failed" });
  }
}

// apply custom x402 middleware
app.use(x402Middleware);

// my demo x402-enabled endpoints, Motivate & Fortune
app.get("/motivate", (req, res) => {
  const chain = req.chainConfig || getChainConfig();
  res.json({
    quote: "Nothing is softer or more flexible than water, yet nothing can resist it.",
    author: "Lao Tzu",
    timestamp: new Date().toISOString(),
    paid: true,
    network: chain.network
  });
});

app.get("/fortune", (req, res) => {
  const chain = req.chainConfig || getChainConfig();
  res.json({
    fortune: "A rising wave carries your destiny forward. Stay fluid, and fortune will flow your way.",
    luckyNumber: Math.floor(Math.random() * 100),
    timestamp: new Date().toISOString(),
    paid: true,
    network: chain.network
  });
});

// Public endpoints
app.get("/", (req, res) => {
  res.json({
    name: "Hyper402 Demo API",
    description: "Demo API showcasing x402 payments on configurable EVM chains",
    facilitator: "Hyper402 (custom facilitator for EIP-3009 chains)",
    endpoints: {
      "GET /health": "Health check",
      "GET /balance/:address": "Get token balance",
      "GET /motivate": "Get motivational quote (requires payment)",
      "GET /fortune": "Get your fortune (requires payment)"
    },
    networks: chainConfigs.map((config) => ({
      network: config.network,
      name: config.name,
      chainId: config.chainId,
      token: `${config.token.symbol} (${config.token.address})`
    })),
    github: "https://github.com/jnix2007/hyper402"
  });
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Hyper402 demo API is running",
    receivingPayments: RECEIVER_WALLET
  });
});

// balance endpoint, get USDC balance on HyperEVM testnet via RPC
app.get("/balance/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const requestedNetwork = req.query.network || DEFAULT_NETWORK;
    const chain = getChainConfig(requestedNetwork);
    
    if (!address) {
      return res.status(400).json({ error: "address is required" });
    }

    if (!chain) {
      return res.status(400).json({ error: "unsupported network" });
    }

    // Create public client for target chain
    const publicClient = createPublicClient({
      chain: {
        id: chain.chainId,
        name: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: {
          default: { http: [chain.rpcUrl] },
          public: { http: [chain.rpcUrl] },
        },
      },
      transport: http(chain.rpcUrl),
    });

    // read token balance
    const balance = await publicClient.readContract({
      address: chain.token.address,
      abi: [{
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      }],
      functionName: "balanceOf",
      args: [address],
    });

    // convert using token decimals
    const balanceInUsdc = Number(balance) / Math.pow(10, chain.token.decimals);

    res.json({ 
      balance: balanceInUsdc.toString(),
      address: address,
      network: chain.network,
      token: chain.token.symbol
    });
  } catch (error) {
    console.error("Balance error:", error);
    res.status(500).json({ 
      error: error.message || "Failed to fetch balance"
    });
  }
});

app.get("/chains", (req, res) => {
  res.json({
    defaultNetwork: DEFAULT_NETWORK,
    chains: chainConfigs.map((config) => ({
      network: config.network,
      name: config.name,
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      blockExplorer: config.blockExplorer,
      faucetUrl: config.faucetUrl,
      nativeCurrency: config.nativeCurrency,
      token: config.token,
    }))
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Hyper402 Demo API running on http://localhost:${PORT}`);
  console.log(`\n📋 Protected Endpoints:`);
  console.log(`   • GET /motivate  - paid endpoint (configurable chain)`);
  console.log(`   • GET /fortune   - paid endpoint (configurable chain)`);
  console.log(`\n💰 Receiving payments at: ${RECEIVER_WALLET}`);
  console.log(`🔧 Using Hyper402 facilitator at: ${FACILITATOR_URL}`);
  console.log(`\n🌐 Available networks:`);
  chainConfigs.forEach((config) => {
    console.log(`   • ${config.name} (${config.network}) - Chain ID ${config.chainId} / Token ${config.token.symbol}`);
  });
  console.log(`\n💡 Make sure Hyper402 facilitator is running with matching CHAIN_CONFIGS!`);
});
