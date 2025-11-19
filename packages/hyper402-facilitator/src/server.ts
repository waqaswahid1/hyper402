/**
 * Hyper402 Facilitator Server
 * Provides /verify and /settle endpoints for x402 payments across configurable EVM chains
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { CdpClient } from "@coinbase/cdp-sdk";
import { verify } from "./verify.js";
import { settle } from "./settle.js";
import { getChainConfigs } from "./config.js";
import type { VerifyRequest, SettleRequest } from "./types.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

const chainConfigs = getChainConfigs();

// Initialize CDP Client
const cdp = new CdpClient();

// Facilitator wallet address (will be created on first run if not exists)
let facilitatorAddress: `0x${string}`;

// Initialize facilitator wallet
async function initializeFacilitator() {
  try {
    // Try to get or create a facilitator account
    // Using original wallet name to reuse funded wallet from HyperPay
    const account = await cdp.evm.getOrCreateAccount({
      name: "hyperpay-facilitator",
    });
    
    facilitatorAddress = account.address;
    console.log(`✅ Facilitator wallet initialized: ${facilitatorAddress}`);
    console.log(`⚠️  Ensure this wallet has gas (${chainConfigs.map((c) => c.nativeCurrency.symbol).join(", ")}) on your configured networks!`);
  } catch (error) {
    console.error("Failed to initialize facilitator wallet:", error);
    throw error;
  }
}

// Root endpoint - info about the facilitator
app.get("/", (req, res) => {
  res.json({
    name: "Hyper402 Facilitator",
    version: "1.0.0",
    description: "x402 payment facilitator for any EVM chain with EIP-3009 tokens",
    networks: chainConfigs.map((config) => ({
      network: config.network,
      chainId: config.chainId,
      name: config.name,
      currency: config.nativeCurrency.symbol,
      token: `${config.token.symbol} (${config.token.address})`,
      blockExplorer: config.blockExplorer,
    })),
    supported: chainConfigs.map((config) => ({
      scheme: "exact",
      network: config.network,
      asset: `${config.token.symbol} (${config.token.address})`,
    })),
    endpoints: {
      "POST /verify": "Verify a payment payload",
      "POST /settle": "Settle a verified payment",
      "GET /supported": "Get supported schemes and networks",
    },
    facilitatorWallet: facilitatorAddress,
    github: "https://github.com/jnix2007/hyper402",
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    facilitatorWallet: facilitatorAddress,
    message: "Hyper402 facilitator is running" 
  });
});

// Get supported schemes and networks
app.get("/supported", (req, res) => {
  res.json({
    kinds: [
      ...chainConfigs.map((config) => ({
        x402Version: 1,
        scheme: "exact",
        network: config.network,
      })),
    ],
  });
});

// Verify endpoint
app.post("/verify", async (req, res) => {
  try {
    const request = req.body as VerifyRequest;

    if (!request.paymentPayload || !request.paymentRequirements) {
      return res.status(400).json({
        error: "Missing paymentPayload or paymentRequirements",
      });
    }

    console.log(`[Hyper402] Verifying payment from ${(request.paymentPayload.payload as any).authorization.from}`);

    const result = await verify(
      request.paymentPayload,
      request.paymentRequirements,
    );

    console.log(`[Hyper402] Verification result: ${result.isValid ? "VALID ✅" : `INVALID ❌ (${result.invalidReason})`}`);

    res.json(result);
  } catch (error) {
    console.error("[Hyper402] Verify error:", error);
    res.status(500).json({
      isValid: false,
      invalidReason: "unexpected_verify_error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Settle endpoint
app.post("/settle", async (req, res) => {
  try {
    const request = req.body as SettleRequest;

    if (!request.paymentPayload || !request.paymentRequirements) {
      return res.status(400).json({
        error: "Missing paymentPayload or paymentRequirements",
      });
    }

    console.log(`[Hyper402] Settling payment from ${(request.paymentPayload.payload as any).authorization.from}`);
    console.log(`[Hyper402] Network: ${request.paymentPayload.network}`);

    if (!facilitatorAddress) {
      throw new Error("Facilitator wallet not initialized");
    }

    const result = await settle(
      cdp,
      facilitatorAddress,
      request.paymentPayload,
      request.paymentRequirements,
    );

    console.log(`[Hyper402] Settlement result: ${result.success ? "SUCCESS ✅" : `FAILED ❌ (${result.errorReason})`}`);
    if (result.transaction) {
      const networkDetails = chainConfigs.find((config) => config.network === request.paymentPayload.network);
      const explorer = networkDetails?.blockExplorer
        ? `${networkDetails.blockExplorer.replace(/\/$/, "")}/tx/${result.transaction}`
        : undefined;
      console.log(`[Hyper402] Transaction: ${explorer ?? result.transaction}`);
    }

    res.json(result);
  } catch (error) {
    console.error("[Hyper402] Settle error:", error);
    res.status(500).json({
      success: false,
      errorReason: "settlement_failed",
      error: error instanceof Error ? error.message : "Unknown error",
      network: (req.body as SettleRequest | undefined)?.paymentPayload?.network ?? "unknown",
    });
  }
});

// Start server
async function start() {
  try {
    await initializeFacilitator();
    
    app.listen(PORT, () => {
      console.log(`\n🚀 Hyper402 Facilitator running on http://localhost:${PORT}`);
      console.log(`\n📋 Endpoints:`);
      console.log(`   • GET  /              - Facilitator info`);
      console.log(`   • GET  /health        - Health check`);
      console.log(`   • GET  /supported     - Supported schemes`);
      console.log(`   • POST /verify        - Verify payment`);
      console.log(`   • POST /settle        - Settle payment`);
      console.log(`\n🔧 Configuration:`);
      chainConfigs.forEach((config) => {
        console.log(`   • Network: ${config.name} (${config.network}) - Chain ID ${config.chainId}`);
        console.log(`     Token: ${config.token.symbol} (${config.token.address})`);
        if (config.blockExplorer) {
          console.log(`     Explorer: ${config.blockExplorer}`);
        }
      });
      console.log(`   • Scheme: exact (EIP-3009)`);
      console.log(`   • Facilitator: ${facilitatorAddress}`);
      console.log(`\n💡 Make sure facilitator wallet has enough native currency for gas!`);
    });
  } catch (error) {
    console.error("Failed to start facilitator:", error);
    process.exit(1);
  }
}

start();

