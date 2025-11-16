/**
 * Hyper402 Settle - Settlement logic using CDP Server Wallets
 */

import { CdpClient } from "@coinbase/cdp-sdk";
import { encodeFunctionData, type Address, type Hex } from "viem";
import type { PaymentPayload, PaymentRequirements, SettleResponse, ExactEvmPayload } from "./types.js";
import { verify } from "./verify.js";
import { USDC_CONFIG, usdcABI } from "./config.js";

/**
 * Settle a payment by executing transferWithAuthorization via CDP Server Wallet
 */
export async function settle(
  cdp: CdpClient,
  facilitatorAddress: `0x${string}`,
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

    console.log(`[Hyper402] Settling payment from ${payload.authorization.from}`);
    console.log(`[Hyper402] Amount: ${payload.authorization.value} (${paymentRequirements.maxAmountRequired} required)`);
    console.log(`[Hyper402] To: ${payload.authorization.to}`);

    // Encode transferWithAuthorization call data
    const callData = encodeFunctionData({
      abi: usdcABI,
      functionName: "transferWithAuthorization",
      args: [
        payload.authorization.from as Address,
        payload.authorization.to as Address,
        BigInt(payload.authorization.value),
        BigInt(payload.authorization.validAfter),
        BigInt(payload.authorization.validBefore),
        payload.authorization.nonce as Hex,
        payload.signature as Hex,
      ],
    });

    // Send transaction via CDP Server Wallet
    // @ts-ignore - HyperEVM testnet not in CDP SDK type definitions yet
    const txResult = await cdp.evm.sendTransaction({
      address: facilitatorAddress,
      network: "hyperevm-testnet",
      transaction: {
        to: USDC_CONFIG.address,
        data: callData,
        value: 0n,
      },
    });

    console.log(`[Hyper402] Transaction submitted: ${txResult.transactionHash}`);
    console.log(`[Hyper402] Settlement successful!`);

    return {
      success: true,
      transaction: txResult.transactionHash,
      network: paymentPayload.network,
      payer: payload.authorization.from,
    };
  } catch (error) {
    console.error("[Hyper402] Settlement error:", error);
    return {
      success: false,
      errorReason: error instanceof Error ? error.message : "settlement_failed",
      transaction: "",
      network: paymentPayload.network,
      payer: payload.authorization.from,
    };
  }
}

