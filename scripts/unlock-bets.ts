import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Domin8Prgm } from "../target/types/domin8_prgm";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Domin8Prgm as Program<Domin8Prgm>;

  console.log("Program ID:", program.programId.toString());
  console.log("Authority:", provider.wallet.publicKey.toString());

  // Derive config PDA
  const [gameConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")],
    program.programId
  );

  console.log("Config PDA:", gameConfigPda.toString());

  // Fetch config to verify it's locked
  const config = await program.account.gameConfig.fetch(gameConfigPda);
  console.log("\nBefore unlock:");
  console.log("  bets_locked:", config.betsLocked);

  if (!config.betsLocked) {
    console.log("\n✓ Bets are already unlocked!");
    return;
  }

  // Call emergency_unlock
  console.log("\n🔓 Calling emergency_unlock...");
  const tx = await program.methods
    .emergencyUnlock()
    .accounts({
      config: gameConfigPda,
      authority: provider.wallet.publicKey,
    })
    .rpc();

  console.log("✓ Transaction:", tx);

  // Verify unlocked
  const configAfter = await program.account.gameConfig.fetch(gameConfigPda);
  console.log("\nAfter unlock:");
  console.log("  bets_locked:", configAfter.betsLocked);

  console.log("\n✅ Bets successfully unlocked!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
