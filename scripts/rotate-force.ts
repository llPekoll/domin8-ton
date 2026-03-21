import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Domin8Prgm } from "../target/types/domin8_prgm";

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

  // Fetch config
  const config = await program.account.gameConfig.fetch(gameConfigPda);
  console.log("\nBefore rotation:");
  console.log("  force (first 16 bytes):", Buffer.from(config.force).subarray(0, 16).toString('hex'));

  console.log("\n🔄 Calling rotate_force...");

  // Call rotate_force instruction
  const tx = await program.methods
    .rotateForce()
    .accounts({
      config: gameConfigPda,
      authority: provider.wallet.publicKey,
    })
    .rpc();

  console.log("✓ Transaction:", tx);

  // Verify rotation
  const configAfter = await program.account.gameConfig.fetch(gameConfigPda);
  console.log("\nAfter rotation:");
  console.log("  force (first 16 bytes):", Buffer.from(configAfter.force).subarray(0, 16).toString('hex'));

  console.log("\n✅ Force field successfully rotated!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
