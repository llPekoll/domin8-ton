"use node";
/**
 * Solana deposit_bet transaction utilities
 * This file contains the logic for calling the deposit_bet instruction from the Domin8 program
 */

import { Buffer } from "buffer";

// Types for transaction parameters
export interface DepositBetParams {
  walletPublicKey: string;
  betAmountSol: number;
  programId?: string;
}

export interface DepositBetResult {
  instruction: any; // TransactionInstruction from @solana/web3.js
  gameRoundPDA: any; // PublicKey
  vaultPDA: any; // PublicKey
  amountLamports: number;
}

/**
 * Creates and sends a deposit_bet transaction to the Solana program
 *
 * @param params - Transaction parameters
 * @returns Promise with transaction result
 */
export async function sendDepositBetTransaction(
  params: DepositBetParams
): Promise<DepositBetResult> {
  const {
    walletPublicKey,
    betAmountSol,
    programId = "3HK2JxZBgv2zy8RnzLTYMCp55GV2xV7CyKqBhYFWV5Kq",
  } = params;

  // Dynamic imports to reduce bundle size
  const { PublicKey, TransactionInstruction, SystemProgram } = await import("@solana/web3.js");

  // Program configuration
  const PROGRAM_ID = new PublicKey(programId);

  // Derive PDAs for game_round and vault (matching Rust constants)
  const [gameRoundPDA] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("game_round")],
    PROGRAM_ID
  );

  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("vault")],
    PROGRAM_ID
  );

  // Convert SOL to lamports
  const amountLamports = Math.floor(betAmountSol * 1_000_000_000);

  // Create instruction data: [discriminator (8 bytes), amount (8 bytes)]
  const instructionData = new Uint8Array(16);

  // Use actual discriminator from built program IDL
  const discriminator = getDepositBetDiscriminator();
  instructionData.set(discriminator, 0);

  // Write amount as little-endian u64
  const view = new DataView(
    instructionData.buffer,
    instructionData.byteOffset,
    instructionData.byteLength
  );
  view.setBigUint64(8, BigInt(amountLamports), true);

  // TransactionInstruction accepts Uint8Array directly (no need for Buffer in browser)
  // Create deposit_bet instruction
  const depositBetIx = new TransactionInstruction({
    keys: [
      { pubkey: gameRoundPDA, isSigner: false, isWritable: true }, // game_round account
      { pubkey: vaultPDA, isSigner: false, isWritable: true }, // vault account
      { pubkey: new PublicKey(walletPublicKey), isSigner: true, isWritable: true }, // player account
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    programId: PROGRAM_ID,
    data: Buffer.from(instructionData), // Convert Uint8Array to Buffer for type compatibility
  });

  return {
    instruction: depositBetIx,
    gameRoundPDA,
    vaultPDA,
    amountLamports,
  };
}

/**
 * Gets the current discriminator for the deposit_bet instruction
 * Extracted from target/idl/domin8_prgm.json after building the program
 *
 * @returns The 8-byte discriminator for the deposit_bet instruction
 */
export function getDepositBetDiscriminator(): Uint8Array {
  // Actual discriminator from built program IDL
  return new Uint8Array([82, 23, 26, 58, 40, 4, 106, 159]);
}

/**
 * Validates bet amount according to program constraints
 *
 * @param amountSol - Bet amount in SOL
 * @returns Object with validation result and error message if invalid
 */
export function validateBetAmount(amountSol: number): { valid: boolean; error?: string } {
  const MIN_BET_SOL = 0.01; // MIN_BET_LAMPORTS = 10_000_000 lamports
  const MAX_BET_SOL = 10; // Reasonable maximum for the game

  if (isNaN(amountSol) || amountSol <= 0) {
    return { valid: false, error: "Bet amount must be a positive number" };
  }

  if (amountSol < MIN_BET_SOL) {
    return { valid: false, error: `Minimum bet is ${MIN_BET_SOL} SOL` };
  }

  if (amountSol > MAX_BET_SOL) {
    return { valid: false, error: `Maximum bet is ${MAX_BET_SOL} SOL` };
  }

  return { valid: true };
}

/**
 * Example usage:
 *
 * ```typescript
 * import { sendDepositBetTransaction, validateBetAmount } from './solana-deposit-bet';
 *
 * // Validate bet amount
 * const validation = validateBetAmount(0.5);
 * if (!validation.valid) {
 *   throw new Error(validation.error);
 * }
 *
 * // Create transaction instruction
 * const { instruction } = await sendDepositBetTransaction({
 *   walletPublicKey: publicKey.toString(),
 *   betAmountSol: 0.5
 * });
 *
 * // Sign and send with your wallet
 * const signature = await wallet.signAndSendTransaction(instruction);
 * console.log('Transaction successful:', signature);
 * ```
 */
