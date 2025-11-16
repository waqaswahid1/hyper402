# HyperPay Quick Start Guide

Get HyperPay running in 5 minutes.

## What You're Building

A complete x402 payment system on HyperEVM testnet with:
- Custom facilitator using CDP Server Wallets
- Demo API that accepts USDC payments
- Web app with CDP Embedded Wallet

## Setup

### Step 1: Install All Dependencies

From the root `/hyperpay` directory:

```bash
npm install
cd packages/hyperpay-facilitator && npm install
cd ../../demo/server && npm install
cd ../client && npm install
cd ../../
```

### Step 2: Configure Facilitator

```bash
cd packages/hyperpay-facilitator
cp .env.example .env
```

Add your CDP API credentials to `.env`.

### Step 3: Start Facilitator

```bash
npm run dev:facilitator
```

**Copy the facilitator wallet address** from the output - you'll need to fund it with HYPE!

### Step 4: Fund Facilitator Wallet

The facilitator needs HYPE to pay gas fees:

1. Copy the facilitator wallet address from step 3
2. Get testnet HYPE (ask in HyperEVM Discord or use bridge)
3. Send some HYPE to the facilitator wallet

### Step 5: Configure Demo API

```bash
cd demo/server
cp .env.example .env
```

Edit `.env`:
- Add your wallet address for `RECEIVER_WALLET`
- Keep `HYPERPAY_FACILITATOR_URL=http://localhost:3002`

### Step 6: Start Demo API

In a new terminal:

```bash
npm run dev:server
```

### Step 7: Configure Client

```bash
cd demo/client
cp .env.local.example .env.local
```

Edit `.env.local` with your CDP Project ID.

### Step 8: Allowlist Domain

In CDP Portal:
1. Go to Embedded Wallet → Configuration
2. Add `http://localhost:3004` to allowed origins

### Step 9: Start Client

In another new terminal:

```bash
npm run dev:client
```

### Step 10: Test It!

1. Open http://localhost:3004
2. Sign in with CDP Embedded Wallet
3. Get testnet USDC from Circle's faucet
4. Click "Get Motivational Quote"
5. Watch the payment happen on HyperEVM! 🎉

## You'll Have Running:

- **Port 3002** - HyperPay Facilitator
- **Port 3003** - Demo API
- **Port 3004** - Web Client

## Troubleshooting

**"Facilitator wallet not initialized"**
- Check CDP API credentials are correct
- Restart facilitator

**"Insufficient gas"**
- Fund facilitator wallet with testnet HYPE

**"CORS error" on client**
- Allowlist `http://localhost:3004` in CDP Portal

**Payment fails**
- Check facilitator has HYPE for gas
- Verify USDC contract address is correct
- Check facilitator logs for errors

## Next Steps

- Deploy facilitator to Railway/Render
- Deploy demo API to Vercel
- Deploy client to Vercel
- Share with the HyperEVM community!

## What Makes This Special

🏆 **First x402 facilitator beyond Base & Solana**  
🔧 **Shows how to add any EVM chain to x402**  
💎 **Uses CDP Server Wallets for production-grade infrastructure**  
📚 **Reference implementation for the community**  

Happy building! 🚀

