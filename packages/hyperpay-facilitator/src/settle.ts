/**
 * HyperPay Settle - Settlement logic using CDP Server Wallets
 */

import { CdpClient } from "@coinbase/cdp-sdk";
import { parseAbi, type Address, type Hex } from "viem";
import type { PaymentPayload, PaymentRequirements, SettleResponse, ExactEvmPayload } from "./types.js";
import { verify } from "./verify.js";
import { USDC_CONFIG } from "./config.js";

/**
 * Settle a payment by executing transferWithAuthorization via CDP Server Wallet
 */
export async function settle(
  cdp: CdpClient,
  facilitatorAddress: string,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  const payload = paymentPayload.payload as ExactEvmPayload;

  try {
    // Re-verify to ensure payment is still valid
    const verifyResult = await verify(paymentPayload, paymentRequirements);

    if (!verifyResult.isValid) {
      return {
        success: false,
        network: paymentPayload.network,
        transaction: "",
        errorReason: verifyResult.invalidReason ?? "invalid_scheme",
        payer: payload.authorization.from,
      };
    }

    console.log(`[HyperPay] Settling payment from ${payload.authorization.from}`);
    console.log(`[HyperPay] Amount: ${payload.authorization.value} (${paymentRequirements.maxAmountRequired} required)`);
    console.log(`[HyperPay] To: ${payload.authorization.to}`);

    // Call transferWithAuthorization using CDP Server Wallet
    const txResult = await cdp.evm.invokeContract({
      address: facilitatorAddress,
      network: "hyperevm-testnet",
      contractAddress: USDC_CONFIG.address,
      abi: parseAbi([
        "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature) external",
      ]),
      method: "transferWithAuthorization",
      args: {
        from: payload.authorization.from,
        to: payload.authorization.to,
        value: payload.authorization.value,
        validAfter: payload.authorization.validAfter,
        validBefore: payload.authorization.validBefore,
        nonce: payload.authorization.nonce,
        signature: payload.signature,
      },
    });

    console.log(`[HyperPay] Transaction submitted: ${txResult.transactionHash}`);
    console.log(`[HyperPay] Settlement successful!`);

    return {
      success: true,
      transaction: txResult.transactionHash,
      network: paymentPayload.network,
      payer: payload.authorization.from,
    };
  } catch (error) {
    console.error("[HyperPay] Settlement error:", error);
    return {
      success: false,
      errorReason: error instanceof Error ? error.message : "settlement_failed",
      transaction: "",
      network: paymentPayload.network,
      payer: payload.authorization.from,
    };
  }
}

