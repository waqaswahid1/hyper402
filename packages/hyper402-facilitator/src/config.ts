/**
 * Runtime Chain Configuration Helpers
 * Allows the facilitator to talk to any EVM chain that supports EIP-3009
 */

export interface TokenConfig {
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  version: string;
}

export interface ChainConfig {
  /**
   * x402 network identifier (e.g. "hyperevm-testnet", "base-sepolia")
   */
  network: string;
  chainId: number;
  name: string;
  rpcUrl: string;
  blockExplorer?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  token: TokenConfig;
}

type ChainConfigInput = ChainConfig | Omit<ChainConfig, "token"> & {
  token: TokenConfig & { address: string };
};

const DEFAULT_CHAIN_CONFIGS: ChainConfig[] = [
  {
    network: "polygon-amoy",
    chainId: 80002,
    name: "Polygon Amoy",
    rpcUrl:
      process.env.POLYGON_AMOY_RPC_URL ||
      "https://rpc-amoy.polygon.technology",
    nativeCurrency: {
      name: "Polygon",
      symbol: "POL",
      decimals: 18,
    },
    blockExplorer: "https://amoy.polygonscan.com",
    token: {
      address: (process.env.POLYGON_AMOY_USDC_CONTRACT_ADDRESS ||
        "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582") as `0x${string}`,
      name: "USDC",
      symbol: "USDC",
      decimals: 6,
      version: "2",
    },
  },
  {
    network: "hyperevm-testnet",
    chainId: 998,
    name: "HyperEVM Testnet",
    rpcUrl:
      process.env.HYPEREVM_RPC_URL ||
      "https://rpc.hyperliquid-testnet.xyz/evm",
    nativeCurrency: {
      name: "HYPE",
      symbol: "HYPE",
      decimals: 18,
    },
    blockExplorer: "https://testnet.purrsec.com",
    token: {
      address: (process.env.USDC_CONTRACT_ADDRESS ||
        "0x2B3370eE501B4a559b57D449569354196457D8Ab") as `0x${string}`,
      name: "USDC",
      symbol: "USDC",
      decimals: 6,
      version: "2",
    },
  },
];

function toChecksumAddress(address: string): `0x${string}` {
  if (!address?.startsWith("0x")) {
    throw new Error(`Invalid token address ${address}`);
  }
  return address as `0x${string}`;
}

function parseChainConfigs(): ChainConfig[] {
  const envConfig = process.env.CHAIN_CONFIGS;

  if (!envConfig) {
    return DEFAULT_CHAIN_CONFIGS;
  }

  try {
    const parsed = JSON.parse(envConfig) as ChainConfigInput[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("CHAIN_CONFIGS must be a non-empty array");
    }

    return parsed.map((config) => ({
      ...config,
      token: {
        ...config.token,
        address: toChecksumAddress(config.token.address),
      },
    }));
  } catch (error) {
    console.warn(
      "[Hyper402] Failed to parse CHAIN_CONFIGS, falling back to Polygon Amoy defaults:",
      error instanceof Error ? error.message : error,
    );
    return DEFAULT_CHAIN_CONFIGS;
  }
}

const chainConfigs = parseChainConfigs();

export function getChainConfigs(): ChainConfig[] {
  return chainConfigs;
}

export function getChainConfig(network: string): ChainConfig | undefined {
  return chainConfigs.find((config) => config.network === network);
}

export function getDefaultChainConfig(): ChainConfig {
  return chainConfigs[0];
}

// EIP-3009 Authorization Types (from x402)
export const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// USDC ABI (EIP-3009 functions)
export const usdcABI = [
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
      { internalType: "uint256", name: "validAfter", type: "uint256" },
      { internalType: "uint256", name: "validBefore", type: "uint256" },
      { internalType: "bytes32", name: "nonce", type: "bytes32" },
      { internalType: "bytes", name: "signature", type: "bytes" },
    ],
    name: "transferWithAuthorization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "version",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "DOMAIN_SEPARATOR",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

