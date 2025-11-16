# @hyperpay/facilitator

x402 payment facilitator implementation for HyperEVM testnet, created as part of HyperPay project for the HyperEVM Hackathon at Devconnect Buenos Aires (Nov'25).

## installation

```bash
npm install @hyperpay/facilitator
```

## usage

### as a Facilitator service

start the facilitator server:

```bash
npm run dev
```

endpoints:
- `POST /verify` - verify payment payload
- `POST /settle` - settle verified payment
- `GET /supported` - get supported schemes

### with x402-express

```javascript
import { paymentMiddleware } from "x402-express";
import { facilitator } from "@hyperpay/facilitator";

app.use(paymentMiddleware(
  receiverWallet,
  {
    "GET /protected": {
      price: "$0.01",
      network: "hyperevm-testnet"
    }
  },
  facilitator
));
```

## configuration

requires CDP API credentials in `.env` since facilitator uses CDP Server Wallet:

```env
CDP_API_KEY_ID=your-key-id
CDP_API_KEY_SECRET=your-key-secret
```

## how it works

1. **verification** - validates EIP-3009 signatures & payment details
2. **settlement** - executes `transferWithAuthorization` via CDP Server Wallet
3. **gas sponsorship** - facilitator pays gas in HYPE

## network details

- **chain id:** 998
- **RPC:** https://rpc.hyperliquid-testnet.xyz/evm
- **USDC:** 0x2B3370eE501B4a559b57D449569354196457D8Ab
- **gas token:** HYPE

## requirements

the facilitator uses a CDP Server Wallet; that wallet must have HYPE tokens to cover gas fees (this way neither the user/agent on the client side, nor the API provider on the server side, need to worry about gas)

## license

MIT

