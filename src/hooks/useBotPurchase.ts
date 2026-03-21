/**
 * React Hook for Bot Purchase Operations
 *
 * Handles purchasing bot tiers. Users can own multiple bots (one of each tier)
 * and switch between them. Payment is sent to the treasury wallet, then recorded via socket.
 */

import { useCallback, useState, useEffect } from "react";
import { useSocket, socketRequest } from "../lib/socket";
import { usePrivyWallet } from "./usePrivyWallet";
import { toast } from "sonner";
import { logger } from "../lib/logger";

const NANO_PER_TON = 1_000_000_000;

// Bot pricing in nanotons
const BOT_PRICES = {
  rookie: 100_000_000, // 0.1 TON
  pro: 500_000_000, // 0.5 TON
  elite: 1_000_000_000, // 1.0 TON
} as const;

export type BotTier = keyof typeof BOT_PRICES;

export function useBotPurchase() {
  const { connected, publicKey, walletAddress, solBalance } = usePrivyWallet();
  const wallets: any[] = []; // TODO: TON migration - bot purchase needs rework
  const { socket } = useSocket();

  // State for queries
  const [activePurchase, setActivePurchase] = useState<any>(null);
  const [allPurchases, setAllPurchases] = useState<any[]>([]);
  const [tierInfo, setTierInfo] = useState<any>(null);

  // Fetch active purchase
  useEffect(() => {
    if (!socket || !walletAddress) return;

    socketRequest(socket, "get-user-bot-purchase", { walletAddress }).then((res) => {
      if (res.success) setActivePurchase(res.data ?? null);
    });
  }, [socket, walletAddress]);

  // Fetch all purchases
  useEffect(() => {
    if (!socket || !walletAddress) return;

    socketRequest(socket, "get-all-user-bots", { walletAddress }).then((res) => {
      if (res.success) setAllPurchases(res.data ?? []);
    });
  }, [socket, walletAddress]);

  // Fetch tier info
  useEffect(() => {
    if (!socket) return;

    socketRequest(socket, "get-bot-tier-info", {}).then((res) => {
      if (res.success) setTierInfo(res.data ?? null);
    });
  }, [socket]);

  // Helper to check if user owns a specific tier
  const ownsTier = useCallback(
    (tier: BotTier): boolean => {
      if (!allPurchases) return false;
      return allPurchases.some((p) => p.tier === tier);
    },
    [allPurchases]
  );

  /**
   * Send TON to treasury and record purchase
   */
  const purchaseBot = useCallback(
    async (tier: BotTier): Promise<{ success: boolean; signature?: string; error?: string }> => {
      if (!connected || !publicKey || !walletAddress) {
        return { success: false, error: "Wallet not connected" };
      }

      const price = BOT_PRICES[tier];
      const priceTON = price / NANO_PER_TON;

      // Check balance
      if (solBalance !== null && solBalance < priceTON + 0.001) {
        return {
          success: false,
          error: `Insufficient balance. Need ${priceTON + 0.001} TON, have ${solBalance.toFixed(3)} TON`,
        };
      }

      // Check if already owns this specific tier
      if (ownsTier(tier)) {
        return {
          success: false,
          error: `You already own a ${tier} bot.`,
        };
      }

      try {
        logger.ui.debug(`[useBotPurchase] Purchasing ${tier} bot for ${priceTON} TON`);

        // TODO: Implement TON transfer
        // Build and send a TON transaction to the treasury wallet
        // Then capture the transaction signature/hash
        const signature = ""; // placeholder

        if (!signature) {
          return { success: false, error: "TON transfer not yet implemented" };
        }

        // Record purchase in database via socket
        if (socket) {
          const recordRes = await socketRequest(socket, "purchase-bot", {
            walletAddress,
            tier,
            transactionSignature: signature,
            purchaseAmount: price,
          });
          if (!recordRes.success) {
            return { success: false, error: recordRes.error || "Failed to record purchase" };
          }

          // Refresh purchases
          socketRequest(socket, "get-all-user-bots", { walletAddress }).then((res) => {
            if (res.success) setAllPurchases(res.data ?? []);
          });
          socketRequest(socket, "get-user-bot-purchase", { walletAddress }).then((res) => {
            if (res.success) setActivePurchase(res.data ?? null);
          });
        }

        toast.success(`${tier.charAt(0).toUpperCase() + tier.slice(1)} Bot Purchased!`, {
          description: `Your bot is ready to configure.`,
        });

        return { success: true, signature };
      } catch (error) {
        logger.ui.error("[useBotPurchase] Purchase failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: errorMessage };
      }
    },
    [connected, publicKey, walletAddress, solBalance, ownsTier, wallets, socket]
  );

  /**
   * Switch to a different bot tier (must own it)
   */
  const setActiveBot = useCallback(
    async (tier: BotTier): Promise<{ success: boolean; error?: string }> => {
      if (!walletAddress || !socket) {
        return { success: false, error: "Wallet not connected" };
      }

      if (!ownsTier(tier)) {
        return { success: false, error: `You don't own a ${tier} bot.` };
      }

      try {
        const res = await socketRequest(socket, "set-active-bot", { walletAddress, tier });
        if (!res.success) throw new Error(res.error);

        // Refresh active purchase
        socketRequest(socket, "get-user-bot-purchase", { walletAddress }).then((r) => {
          if (r.success) setActivePurchase(r.data ?? null);
        });

        toast.success(`Switched to ${tier.charAt(0).toUpperCase() + tier.slice(1)} Bot!`);
        return { success: true };
      } catch (error) {
        logger.ui.error("[useBotPurchase] Switch failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: errorMessage };
      }
    },
    [walletAddress, ownsTier, socket]
  );

  /**
   * Get price for a bot tier (full price, no upgrades)
   */
  const getPrice = useCallback(
    (tier: BotTier): { cost: number; costSOL: number } | null => {
      // If already owned, return null
      if (ownsTier(tier)) {
        return null;
      }

      return {
        cost: BOT_PRICES[tier],
        costSOL: BOT_PRICES[tier] / NANO_PER_TON,
      };
    },
    [ownsTier]
  );

  return {
    // State
    connected,
    activePurchase,
    allPurchases: allPurchases || [],
    activeTier: (activePurchase?.tier as BotTier) || null,
    hasPurchased: !!activePurchase,
    tierInfo,
    prices: BOT_PRICES,

    // Actions
    purchaseBot,
    setActiveBot,
    getPrice,
    ownsTier,

    // Helper
    canAfford: (tier: BotTier) => {
      if (solBalance === null) return false;
      if (ownsTier(tier)) return false; // Already owned
      const priceTON = BOT_PRICES[tier] / NANO_PER_TON;
      return solBalance >= priceTON + 0.001;
    },
  };
}
