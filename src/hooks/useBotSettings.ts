/**
 * React Hook for Bot Settings Management
 *
 * Handles bot configuration, toggling, and statistics.
 */

import { useCallback, useState, useEffect } from "react";
import { useSocket, socketRequest } from "../lib/socket";
import { usePrivyWallet } from "./usePrivyWallet";
import { toast } from "sonner";
import { logger } from "../lib/logger";

const NANO_PER_TON = 1_000_000_000;

export interface BotConfiguration {
  // Rookie settings
  fixedBetAmount?: number;
  selectedCharacter?: number;
  budgetLimit?: number;

  // Pro settings
  betMin?: number;
  betMax?: number;
  stopLoss?: number;
  winStreakMultiplier?: number;
  cooldownRounds?: number;
  characterRotation?: number[];

  // Elite settings
  takeProfit?: number;
  martingaleEnabled?: boolean;
  antiMartingaleEnabled?: boolean;
  scheduleStart?: number;
  scheduleEnd?: number;
  smartSizing?: boolean;
  smartSizingThreshold?: number;
}

export function useBotSettings() {
  const { connected, publicKey, walletAddress, solBalance } = usePrivyWallet();
  const wallets: any[] = []; // TODO: TON migration - bot signing needs rework
  const { socket } = useSocket();

  // State for queries
  const [config, setConfig] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [recentPerformance, setRecentPerformance] = useState<any>(null);

  // Fetch configuration
  useEffect(() => {
    if (!socket || !walletAddress) return;

    socketRequest(socket, "get-bot-configuration", { walletAddress }).then((res) => {
      if (res.success) setConfig(res.data ?? null);
    });
  }, [socket, walletAddress]);

  // Fetch stats
  useEffect(() => {
    if (!socket || !walletAddress) return;

    socketRequest(socket, "get-bot-stats", { walletAddress }).then((res) => {
      if (res.success) setStats(res.data ?? null);
    });
  }, [socket, walletAddress]);

  // Fetch recent performance
  useEffect(() => {
    if (!socket || !walletAddress) return;

    socketRequest(socket, "get-recent-bot-performance", { walletAddress, limit: 20 }).then((res) => {
      if (res.success) setRecentPerformance(res.data ?? null);
    });
  }, [socket, walletAddress]);

  /**
   * Save bot settings
   */
  const saveSettings = useCallback(
    async (settings: Partial<BotConfiguration>): Promise<{ success: boolean; error?: string }> => {
      if (!walletAddress || !socket) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        const res = await socketRequest(socket, "save-bot-configuration", {
          walletAddress,
          config: settings,
        });
        if (!res.success) throw new Error(res.error);

        // Refresh config
        socketRequest(socket, "get-bot-configuration", { walletAddress }).then((r) => {
          if (r.success) setConfig(r.data ?? null);
        });

        toast.success("Settings saved");
        return { success: true };
      } catch (error) {
        logger.ui.error("[useBotSettings] Save failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to save settings";
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [walletAddress, socket]
  );

  /**
   * Toggle bot active state
   */
  const toggleBot = useCallback(
    async (active: boolean): Promise<{ success: boolean; error?: string }> => {
      if (!walletAddress || !socket) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        const res = await socketRequest(socket, "toggle-bot-active", {
          walletAddress,
          isActive: active,
        });
        if (!res.success) throw new Error(res.error);

        // Refresh config
        socketRequest(socket, "get-bot-configuration", { walletAddress }).then((r) => {
          if (r.success) setConfig(r.data ?? null);
        });

        toast.success(active ? "Bot activated" : "Bot deactivated");
        return { success: true };
      } catch (error) {
        logger.ui.error("[useBotSettings] Toggle failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to toggle bot";
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [walletAddress, socket]
  );

  /**
   * Update session signer state
   */
  const updateSessionSigner = useCallback(
    async (enabled: boolean): Promise<{ success: boolean; error?: string }> => {
      if (!walletAddress || !socket) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        const res = await socketRequest(socket, "update-session-signer-state", {
          walletAddress,
          enabled,
        });
        if (!res.success) throw new Error(res.error);

        // Refresh config
        socketRequest(socket, "get-bot-configuration", { walletAddress }).then((r) => {
          if (r.success) setConfig(r.data ?? null);
        });

        return { success: true };
      } catch (error) {
        logger.ui.error("[useBotSettings] Session signer update failed:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Failed to update session signer";
        return { success: false, error: errorMessage };
      }
    },
    [walletAddress, socket]
  );

  /**
   * Refill bot budget by sending TON to treasury
   */
  const refillBudget = useCallback(
    async (
      amountTON: number
    ): Promise<{ success: boolean; signature?: string; error?: string }> => {
      if (!connected || !publicKey || !walletAddress || !socket) {
        return { success: false, error: "Wallet not connected" };
      }

      const amountNanotons = Math.floor(amountTON * NANO_PER_TON);

      if (amountNanotons < 10_000_000) {
        return { success: false, error: "Minimum refill is 0.01 TON" };
      }

      // Check balance
      if (solBalance !== null && solBalance < amountTON + 0.001) {
        return {
          success: false,
          error: `Insufficient balance. Need ${amountTON + 0.001} TON, have ${solBalance.toFixed(3)} TON`,
        };
      }

      try {
        logger.ui.debug(`[useBotSettings] Refilling budget with ${amountTON} TON`);

        // TODO: Implement TON transfer
        // Build and send a TON transaction to the treasury wallet
        // Then capture the transaction signature/hash
        const signature = ""; // placeholder

        if (!signature) {
          return { success: false, error: "TON transfer not yet implemented" };
        }

        // Record refill in database via socket
        const refillRes = await socketRequest(socket, "refill-budget", {
          walletAddress,
          additionalBudget: amountNanotons,
          transactionSignature: signature,
        });
        if (!refillRes.success) {
          return { success: false, error: refillRes.error || "Failed to record refill" };
        }

        // Refresh config
        socketRequest(socket, "get-bot-configuration", { walletAddress }).then((r) => {
          if (r.success) setConfig(r.data ?? null);
        });

        toast.success(`Budget refilled with ${amountTON} TON`);
        return { success: true, signature };
      } catch (error) {
        logger.ui.error("[useBotSettings] Refill failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: errorMessage };
      }
    },
    [connected, publicKey, walletAddress, solBalance, wallets, socket]
  );

  // Computed values
  const isActive = config?.isActive ?? false;
  const sessionSignerEnabled = config?.sessionSignerEnabled ?? false;
  const tier = config?.tier ?? null;

  const budgetInfo = {
    limit: config?.budgetLimit ?? 0,
    spent: config?.currentSpent ?? 0,
    remaining: (config?.budgetLimit ?? 0) - (config?.currentSpent ?? 0),
    limitSOL: (config?.budgetLimit ?? 0) / NANO_PER_TON,
    spentSOL: (config?.currentSpent ?? 0) / NANO_PER_TON,
    remainingSOL: ((config?.budgetLimit ?? 0) - (config?.currentSpent ?? 0)) / NANO_PER_TON,
    percentUsed:
      config?.budgetLimit && config.budgetLimit > 0
        ? ((config.currentSpent ?? 0) / config.budgetLimit) * 100
        : 0,
  };

  return {
    // State
    config,
    isActive,
    sessionSignerEnabled,
    tier,
    budgetInfo,

    // Stats
    stats,
    recentPerformance,

    // Actions
    saveSettings,
    toggleBot,
    updateSessionSigner,
    refillBudget,

    // Helpers
    canActivate: sessionSignerEnabled && budgetInfo.remaining > 0,
  };
}
