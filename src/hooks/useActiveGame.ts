/**
 * Hook for subscribing to active game state via Socket.io
 *
 * Real-time game state subscription.
 * Gets game state from the backend which syncs with the TON blockchain.
 */
import { useState, useEffect, useCallback } from "react";
import { useSocket, socketRequest } from "../lib/socket";
import { useAssets } from "../contexts/AssetsContext";
import { logger } from "../lib/logger";

// Bet info structure (matching backend format)
export interface BetInfo {
  walletIndex: number;
  amount: number;
  skin: number;
  position: [number, number];
}

// Game status constants
export const GAME_STATUS = {
  OPEN: 0,
  CLOSED: 1,
  WAITING: 2,
} as const;

// Active game state (matching the backend GameRound interface)
export interface ActiveGameState {
  gameRound: number;
  startDate: number;
  endDate: number;
  totalDeposit: number;
  rand: string;
  map: number;
  userCount: number;
  force: number[];
  status: number;
  winner: string | null;
  winnerPrize: number;
  winningBetIndex: number | null;
  wallets: string[];
  bets: BetInfo[];
  prizeSent?: boolean;

  // Computed compat properties
  roundId: number;
  startTimestamp: number;
  endTimestamp: number;
  totalPot: number;
  betCount: number;
  betAmounts: number[];
  betSkin: number[];
  betPosition: number[][];
  betWalletIndex: number[];

  // Map enrichment
  mapData?: any;
}

export function useActiveGame() {
  const [activeGame, setActiveGame] = useState<ActiveGameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { socket } = useSocket();
  const { getMapById } = useAssets();

  // Convert string status to numeric (Phaser expects numbers)
  const statusToNumber = (status: any): number => {
    if (typeof status === "number") return status;
    if (status === "open") return GAME_STATUS.OPEN;       // 0
    if (status === "closed" || status === "finished") return GAME_STATUS.CLOSED; // 1
    if (status === "waiting") return GAME_STATUS.WAITING;  // 2
    return GAME_STATUS.WAITING;
  };

  // Enrich game data with map info
  const enrichWithMap = useCallback(
    (game: any): ActiveGameState | null => {
      if (!game) return null;

      // Fallback mapId to 1 if 0 or missing
      const rawMapId = game.map ?? game.mapId ?? 0;
      const mapId = rawMapId > 0 ? rawMapId : 1;
      const mapData = getMapById(mapId) || null;

      return {
        ...game,
        // Convert status to numeric for Phaser compatibility
        status: statusToNumber(game.status),
        map: mapId,
        // Ensure compat properties exist
        roundId: game.roundId ?? game.gameRound ?? 0,
        startTimestamp: game.startTimestamp ?? game.startDate ?? 0,
        endTimestamp: game.endTimestamp ?? game.endDate ?? 0,
        totalPot: game.totalPot ?? game.totalDeposit ?? 0,
        betCount: game.betCount ?? game.bets?.length ?? 0,
        betAmounts: game.betAmounts ?? game.bets?.map((b: any) => b.amount) ?? [],
        betSkin: game.betSkin ?? game.bets?.map((b: any) => b.skin) ?? [],
        betPosition: game.betPosition ?? game.bets?.map((b: any) => b.position) ?? [],
        betWalletIndex: game.betWalletIndex ?? game.bets?.map((b: any) => b.walletIndex) ?? [],
        wallets: game.wallets ?? [],
        bets: game.bets ?? [],
        mapData,
      };
    },
    [getMapById]
  );

  // Fetch initial game state from backend
  useEffect(() => {
    if (!socket) return;

    const fetchInitial = async () => {
      try {
        // Try to get the last finished game (backend stores in DB)
        const res = await socketRequest(socket, "get-last-finished-game", {});
        if (res.success && res.data) {
          const enriched = enrichWithMap(res.data);
          setActiveGame(enriched);
          logger.chain.debug("[useActiveGame] Initial state loaded from backend");
        }
      } catch (err) {
        logger.chain.debug("[useActiveGame] No initial game state:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitial();
  }, [socket, enrichWithMap]);

  // Listen for real-time game state updates from backend
  useEffect(() => {
    if (!socket) return;

    const handleGameStateUpdate = (data: any) => {
      logger.chain.debug("[useActiveGame] Game state update:", data);

      if (!data) {
        setActiveGame(null);
        return;
      }

      const enriched = enrichWithMap(data);
      setActiveGame(enriched);
    };

    const handleParticipantsUpdate = (data: any) => {
      logger.chain.debug("[useActiveGame] Participants update:", data);
      if (data?.bets) {
        setActiveGame((prev) =>
          prev ? { ...prev, bets: data.bets, betCount: data.bets.length } : prev
        );
      }
    };

    socket.on("game-state-update", handleGameStateUpdate);
    socket.on("participants-update", handleParticipantsUpdate);

    return () => {
      socket.off("game-state-update", handleGameStateUpdate);
      socket.off("participants-update", handleParticipantsUpdate);
    };
  }, [socket, enrichWithMap]); // NO activeGame dependency — prevents infinite loop

  return {
    activeGame,
    isLoading,
    activeGamePDA: null, // No PDA on TON
  };
}
