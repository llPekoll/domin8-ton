/**
 * Emergency script to fix stuck counter
 * Sets the counter to 4 so new games can be created
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Domin8Prgm } from "../target/types/domin8_prgm";
import IDL from "../target/idl/domin8_prgm.json";
import BN from "bn.js";
import fs from "fs";

async function main() {
  // Setup connection
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Load authority keypair from Anchor.toml wallet
  const authorityKeyPath = `${process.env.HOME}/work/domin8/solana/7H9uSFKd1h4pvFPFfqzLpSZyLac7F9ax9ZcFtv9B5oDf.json`;
  const authorityKey = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(authorityKeyPath, "utf-8")))
  );

  // Setup provider
  const wallet = new Wallet(authorityKey);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  // Load program
  const programId = new PublicKey(IDL.address);
  const program = new Program<Domin8Prgm>(IDL as any, provider);

  console.log("Authority:", authorityKey.publicKey.toString());
  console.log("Program ID:", programId.toString());

  // Set counter to 5 (next round after finished game 4)
  const newValue = 5;

  try {
    console.log(`\nSetting counter to ${newValue}...`);

    const tx = await program.methods
      .setCounter(new BN(newValue))
      .accounts({
        authority: authorityKey.publicKey,
      })
      .rpc();

    console.log("✅ Counter set successfully!");
    console.log("Transaction:", tx);

    // Verify
    const [counterPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("game_counter")],
      programId
    );

    const counterAccount = await program.account.gameCounter.fetch(counterPda);
    console.log("\nVerified - Current counter:", counterAccount.currentRoundId.toString());

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main().then(() => process.exit(0));
