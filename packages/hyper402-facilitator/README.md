# @hyper402/facilitator

x402 payment facilitator implementation capable of targeting any EVM chain with an EIP-3009 token (defaults to HyperEVM testnet), created as part of Hyper402 project for the HyperEVM Hackathon at Devconnect Buenos Aires (Nov'25)

## installation

```bash
npm install @hyper402/facilitator
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

### with custom middleware

**Note:** standard x402-express doesn't support custom chains due to hardcoded network validation, you need custom middleware - see `demo/server/index.js` for the full implementation (~50 lines)

example integration:
```javascript
// Custom middleware that calls Hyper402 facilitator
import { facilitator } from "@hyper402/facilitator";

// 1. Return 402 with payment requirements
// 2. Call facilitator.url + '/verify' 
// 3. Call facilitator.url + '/settle'
// 4. Add X-PAYMENT-RESPONSE header
// 5. Continue to endpoint
```

**future:** once `@hyper402/express` middleware package is published, integration will be 3 lines (see roadmap in the main README)

## config

requires CDP API credentials and Wallet Secret in `.env`:

```env
CDP_API_KEY_ID=your-key-id
CDP_API_KEY_SECRET=your-key-secret
CDP_WALLET_SECRET=your-wallet-secret
PORT=3002
```

### multi-chain support

Declare one or more chains by exporting `CHAIN_CONFIGS` as a JSON array. Omit it to stay on the HyperEVM defaults.

```env
CHAIN_CONFIGS='[
  {
    "network": "hyperevm-testnet",
    "chainId": 998,
    "name": "HyperEVM Testnet",
    "rpcUrl": "https://rpc.hyperliquid-testnet.xyz/evm",
    "nativeCurrency": { "name": "HYPE", "symbol": "HYPE", "decimals": 18 },
    "token": {
      "address": "0x2B3370eE501B4a559b57D449569354196457D8Ab",
      "name": "USDC",
      "symbol": "USDC",
      "decimals": 6,
      "version": "2"
    },
    "blockExplorer": "https://testnet.purrsec.com"
  },
  {
    "network": "base-sepolia",
    "chainId": 84532,
    "name": "Base Sepolia",
    "rpcUrl": "https://sepolia.base.org",
    "nativeCurrency": { "name": "ETH", "symbol": "ETH", "decimals": 18 },
    "token": {
      "address": "0x1234567890abcdef1234567890abcdef12345678",
      "name": "USDC",
      "symbol": "USDC",
      "decimals": 6,
      "version": "2"
    },
    "blockExplorer": "https://sepolia.basescan.org"
  }
]'
```

Each entry declares the x402 `network` slug your clients will request. The facilitator reuses the same CDP Server Wallet across all configured chains.

the facilitator creates a CDP Server Wallet named "hyperpay-facilitator" which must be funded with native gas on whichever networks you support

## how it works

1. **verification** - validates EIP-3009 signatures & payment details
   - checks EIP-712 signature recovery
   - verifies amounts, recipients, deadlines
   - confirms user has sufficient USDC balance

2. **settlement** - executes `transferWithAuthorization` on the selected EVM chain
   - gets CDP Server Wallet account
   - converts to viem account via `toAccount()` (this works on any EVM chain)
   - sends transaction to USDC contract
   - waits for confirmation

3. **gas sponsorship** - facilitator pays gas in the chain's native token
   - user pays 0 gas (gasless UX)
   - API provider pays 0 gas
   - facilitator's CDP wallet pays a small amount of native gas per transaction

## defaults

- **chain id:** 998
- **RPC:** https://rpc.hyperliquid-testnet.xyz/evm
- **USDC contract:** 0x2B3370eE501B4a559b57D449569354196457D8Ab
- **EIP-712 name:** "USDC" (note: different from "USD Coin" on other chains!)
- **EIP-712 version:** "2"
- **gas token:** HYPE
- **block explorer:** https://testnet.purrsec.com/

## requirements

the facilitator uses a CDP Server Wallet; that wallet must have native gas on each configured chain (this way neither the user/agent on the client side, nor the API provider on the server side, need to worry about gas)

## license

MIT

