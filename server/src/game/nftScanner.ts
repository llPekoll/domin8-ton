/**
 * NFT scanning functions for collection holder verification
 *
 * TODO: Replace DAS API calls with TON NFT verification.
 */
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { nftCollectionHolders, nftRefreshLimits, characters } from "../db/schema.js";


/**
 * Verify NFT ownership in real-time using DAS API (Helius)
 */
export async function verifyNFTOwnershipRealtime(
  walletAddress: string,
  collectionAddress: string
): Promise<{ owns: boolean; count: number }> {
  try {
    // Check cache first
    const [cached] = await db
      .select()
      .from(nftCollectionHolders)
      .where(
        and(
          eq(nftCollectionHolders.collectionAddress, collectionAddress),
          eq(nftCollectionHolders.walletAddress, walletAddress)
        )
      )
      .limit(1);

    if (cached) {
      return { owns: cached.nftCount > 0, count: cached.nftCount };
    }

    // TODO: Implement TON NFT verification (replaces Solana DAS API)
    return { owns: false, count: 0 };
  } catch (error) {
    console.error("[NFTScanner] Error verifying ownership:", error);
    return { owns: false, count: 0 };
  }
}

/**
 * Get all NFT holders for a list of wallets
 */
export async function getAllNFTHoldersForWallets(walletAddresses: string[]) {
  const allHolders: Array<{ collectionAddress: string; walletAddress: string; nftCount: number }> = [];

  for (const wallet of walletAddresses) {
    const holders = await db
      .select()
      .from(nftCollectionHolders)
      .where(eq(nftCollectionHolders.walletAddress, wallet));

    for (const h of holders) {
      allHolders.push({
        collectionAddress: h.collectionAddress,
        walletAddress: h.walletAddress,
        nftCount: h.nftCount,
      });
    }
  }

  return allHolders;
}

/**
 * Manual NFT refresh with rate limiting
 */
export async function manualRefreshNFT(
  walletAddress: string
): Promise<{ success: boolean; error?: string }> {
  // Check rate limit (5 min cooldown)
  const [rateLimit] = await db
    .select()
    .from(nftRefreshLimits)
    .where(eq(nftRefreshLimits.walletAddress, walletAddress))
    .limit(1);

  const now = Math.floor(Date.now() / 1000);
  if (rateLimit && now - rateLimit.lastRefreshAt < 300) {
    const remaining = 300 - (now - rateLimit.lastRefreshAt);
    return { success: false, error: `Rate limited. Try again in ${remaining}s` };
  }

  // Get all NFT collections from characters
  const nftCharacters = await db
    .select()
    .from(characters)
    .where(eq(characters.isActive, true));

  const collections = nftCharacters
    .filter((c) => c.nftCollection)
    .map((c) => c.nftCollection!);

  // Check each collection
  for (const collection of collections) {
    await verifyNFTOwnershipRealtime(walletAddress, collection);
  }

  // Update rate limit
  if (rateLimit) {
    await db
      .update(nftRefreshLimits)
      .set({ lastRefreshAt: now, refreshCount: rateLimit.refreshCount + 1 })
      .where(eq(nftRefreshLimits.id, rateLimit.id));
  } else {
    await db.insert(nftRefreshLimits).values({
      walletAddress,
      lastRefreshAt: now,
      refreshCount: 1,
    });
  }

  return { success: true };
}
