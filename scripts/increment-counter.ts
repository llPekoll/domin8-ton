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

  // Derive counter PDA
  const [gameCounterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_counter")],
    program.programId
  );

  console.log("Counter PDA:", gameCounterPda.toString());

  // Fetch counter
  const counter = await program.account.gameCounter.fetch(gameCounterPda);
  console.log("\nBefore increment:");
  console.log("  current_round_id:", counter.currentRoundId.toString());

  // Manually increment (this is a hack - we'll update the account data directly)
  // Since there's no increment instruction, we need to add one
  console.log("\n⚠️  No increment instruction exists!");
  console.log("The counter will auto-increment on next create_game call.");
  console.log("Current round 6 is finished, next create_game will create round 6 and increment to 7.");
  console.log("\n⚠️  PROBLEM: Round 6 already exists, so create_game will fail!");
  console.log("\nSOLUTION: We need to either:");
  console.log("1. Add an admin instruction to manually set counter value");
  console.log("2. Close the existing Round 6 account so it can be recreated");
  console.log("3. Change the logic to increment BEFORE deriving PDA");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
