import express from "express";
import cors from "cors";
import { paymentMiddleware } from "x402-express";
import { facilitator } from "@hyperpay/facilitator";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

// Parse JSON bodies
app.use(express.json());

// Enable CORS
app.use(cors());

// Your wallet address that will receive payments
const RECEIVER_WALLET = process.env.RECEIVER_WALLET || "0xYourWalletAddress";

// Apply x402 payment middleware with HyperPay facilitator
app.use(paymentMiddleware(
  RECEIVER_WALLET,
  {
    "GET /motivate": {
      price: "$0.01",
      network: "hyperevm-testnet",
      config: {
        description: "Get a motivational quote to power through your day",
        outputSchema: {
          type: "object",
          properties: {
            quote: { type: "string" },
            timestamp: { type: "string" },
            paid: { type: "boolean" }
          }
        }
      }
    },
    "GET /fortune": {
      price: "$0.05",
      network: "hyperevm-testnet",
      config: {
        description: "Get your fortune told",
        outputSchema: {
          type: "object",
          properties: {
            fortune: { type: "string" },
            luckyNumber: { type: "number" }
          }
        }
      }
    }
  },
  facilitator // HyperPay facilitator
));

// Protected endpoints
app.get("/motivate", (req, res) => {
  res.json({
    quote: "Work hard, have fun, make history.",
    timestamp: new Date().toISOString(),
    paid: true,
    network: "hyperevm-testnet"
  });
});

app.get("/fortune", (req, res) => {
  const fortunes = [
    "Great success awaits you in the crypto markets.",
    "Your next deploy will be bug-free.",
    "A generous airdrop is in your future.",
    "Your code will compile on the first try today.",
    "You will discover an innovative use case for liquid looping.",
  ];
  
  res.json({
    fortune: fortunes[Math.floor(Math.random() * fortunes.length)],
    luckyNumber: Math.floor(Math.random() * 100),
    timestamp: new Date().toISOString(),
    paid: true,
    network: "hyperevm-testnet"
  });
});

// Public endpoints
app.get("/", (req, res) => {
  res.json({
    name: "HyperPay Demo API",
    description: "Demo API showcasing x402 payments on HyperEVM testnet",
    facilitator: "HyperPay (custom facilitator for HyperEVM)",
    endpoints: {
      "GET /health": "Health check",
      "GET /motivate": "Get motivational quote (requires 0.01 USDC payment)",
      "GET /fortune": "Get your fortune (requires 0.05 USDC payment)"
    },
    network: {
      name: "HyperEVM Testnet",
      chainId: 998,
      paymentToken: "USDC"
    },
    github: "https://github.com/jnix2007/hyperpay"
  });
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "HyperPay demo API is running",
    receivingPayments: RECEIVER_WALLET
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 HyperPay Demo API running on http://localhost:${PORT}`);
  console.log(`\n📋 Protected Endpoints:`);
  console.log(`   • GET /motivate  - $0.01 USDC on HyperEVM testnet`);
  console.log(`   • GET /fortune   - $0.05 USDC on HyperEVM testnet`);
  console.log(`\n💰 Receiving payments at: ${RECEIVER_WALLET}`);
  console.log(`🔧 Using HyperPay facilitator at: ${facilitator.url}`);
  console.log(`\n💡 Make sure HyperPay facilitator is running on ${facilitator.url}!`);
});

