# HyperPay - x402 Facilitator for HyperEVM

![HyperPay](./hyperpay.png)

**The first x402 payment facilitator for HyperEVM**, enabling API monetization on any EVM-compatible chain.

Built for the HyperEVM Hackathon hosted by Looping Collective & StakingRewards at Devconnect Buenos Aires, November 2025.

## what is HyperPay?

HyperPay is a self-hosted x402 facilitator that brings the x402 payment protocol to HyperEVM, starting on testnet but easily configurable for mainnet. It enables API providers to accept USDC payments on HyperEVM using the same dead-simple integration other facilitators provide on chains like Solana and Base.

### features

✅ **EIP-3009 compatible** - Gasless payments using `transferWithAuthorization`  
✅ **CDP Server Wallets** - Secure key management and automatic nonce & retry handling 
✅ **Standard x402 protocol** - Works with existing x402 client libraries  
✅ **Production-ready** - Full verification and settlement logic  
✅ **Open source** - Template for adding x402 to any EVM chain  

## high-level architecture

My core contribution here is the x402 Facilitator for HyperEVM. **Along with the facilitator, I've included an end-to-end, full-stack demo showcasing HyperEVM x402 payments in action**:

- Web app lets the user sign in, get a CDP Embedded Wallet, and faucet USDC on HyperEVM testnet
- The user can one-click call a simple x402-enabled API running in the backend, which is x402-enabled using HyperPay's facilitator on HyperEVM
- The API will respond with 402 payment required, directing the user to pay $0.01 USDC on HyperEVM testnet to access its services
- The client wallet signs and retries using the X-PAYMENT header the x402 protocol expects
- The API server calls HyperPay's facilitator to verify and settle payment on HyperEVM
- With payment complete, the API provides the requested service/content to the user


```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│    Client    │         │   Demo API   │         │   HyperPay   │
│              │◄───────►│              │◄───────►│ (Facilitator)│
└──────────────┘         └──────────────┘         └──────────────┘
                                                          │
                                                          ▼
                                                   ┌──────────────┐
                                                   │ CDP Server   │
                                                   │   Wallet     │
                                                   └──────┬───────┘
                                                          │
                                                          ▼
                                                   ┌──────────────┐
                                                   │  HyperEVM    │
                                                   │   Testnet    │
                                                   └──────────────┘
```

## project structure

```
hyperpay/
├── packages/
│   └── hyperpay-facilitator/    # The facilitator implementation
│       ├── src/
│       │   ├── server.ts        # Express server with /verify & /settle
│       │   ├── verify.ts        # Payment verification logic
│       │   ├── settle.ts        # Settlement via CDP Server Wallets
│       │   ├── config.ts        # HyperEVM & USDC configuration
│       │   ├── types.ts         # TypeScript interfaces
│       │   └── index.ts         # Export facilitator instance
│       └── package.json
└── demo/
    ├── server/                   # Demo API using HyperPay
    │   ├── index.js             # Express API with x402 middleware
    │   └── package.json
    └── client/                   # Web app
        ├── app/                 # Next.js app with CDP Embedded Wallet
        └── package.json
```

## quickstart

### pre-reqs

1. Node.js v18+
2. CDP API Key from https://portal.cdp.coinbase.com/
3. CDP Server Wallet with HYPE on HyperEVM testnet to pay gas fees

### 1. install dependencies

```bash
npm install
```

### 2. configure HyperPay facilitator

```bash
cd packages/hyperpay-facilitator
cp .env.example .env
```

Edit `.env`:
```env
CDP_API_KEY_ID=your-api-key-id
CDP_API_KEY_SECRET=your-api-key-secret
PORT=3002
```

### 3. start HyperPay facilitator

```bash
npm run dev:facilitator
```

you should see:
```
🚀 HyperPay Facilitator running on http://localhost:3002
✅ Facilitator wallet initialized: 0x...
⚠️  Make sure this wallet has HYPE for gas!
```

**important:** fund the facilitator wallet with testnet HYPE for gas!

### 4. configure demo API

```bash
cd demo/server
cp .env.example .env
```

Edit `.env`:
```env
RECEIVER_WALLET=0xYourWalletAddressHere
HYPERPAY_FACILITATOR_URL=http://localhost:3002
```

### 5. start demo API server

```bash
npm run dev:server
```

### 6. configure client

```bash
cd demo/client
cp .env.local.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_CDP_PROJECT_ID=your-project-id
NEXT_PUBLIC_API_URL=http://localhost:3003
```

### 7. start client

```bash
npm run dev:client
```

visit http://localhost:3004

## how it works

### for API providers

3 lines of code to accept payments on HyperEVM using HyperPay's facilitator:

```javascript
import { paymentMiddleware } from "x402-express";
import { facilitator } from "@hyperpay/facilitator";

app.use(paymentMiddleware(
  "0xYourWallet",
  {
    "GET /api": {
      price: "$0.01",
      network: "hyperevm-testnet"
    }
  },
  facilitator
));
```

### for users & agents

1. sign in with CDP Embedded Wallet (email/SMS/Google/X)
2. get testnet USDC from Circle's faucet
3. call paid APIs - payment happens *automatically*

## tech details

### HyperEVM testnet configuration

- **chain id:** 998
- **RPC:** https://rpc.hyperliquid-testnet.xyz/evm
- **native token:** HYPE (for gas)
- **USDC contract:** `0x2B3370eE501B4a559b57D449569354196457D8Ab`
- **explorer:** https://testnet.purrsec.com/

### payment flow

1. client requests API endpoint
2. server returns 402 with payment requirements
3. client creates EIP-3009 authorization (signed off-chain)
4. client retries with X-PAYMENT header
5. server calls HyperPay `/verify`
6. HyperPay verifies signature & checks balance
7. server calls HyperPay `/settle`
8. HyperPay calls `transferWithAuthorization` via CDP Server Wallet
9. CDP Server Wallet pays gas (HYPE)
10. USDC transfers from client to API provider
11. server returns protected content

### why HyperPay matters

**for the x402 ecosystem:**
- first facilitator beyond Base & Solana
- proves x402 works on any EVM chain
- reference implementation for other chains

**for HyperEVM:**
- enables API monetization on HyperEVM
- showcases EVM compatibility
- attracts developers building paid services

**for CDP:**
- demonstrates Server Wallets on new chains
- shows Embedded Wallet flexibility
- expands x402 reach

## deployment

### facilitator (Railway/Render)

environment variables:
- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`
- `HYPEREVM_RPC_URL`

### demo API (Vercel/Railway)

environment variables:
- `RECEIVER_WALLET`
- `HYPERPAY_FACILITATOR_URL`

### client (Vercel)

environment variables:
- `NEXT_PUBLIC_CDP_PROJECT_ID`
- `NEXT_PUBLIC_API_URL`

don't forget to allowlist your domain in CDP Portal under Embedded Wallets

## license

MIT

## links

- [x402 protocol](https://www.x402.org/)