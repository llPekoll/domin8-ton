/**
 * Hook for accessing game state
 *
 * Uses Socket.io backend updates (not direct blockchain reads).
 */
import { useActiveGame } from "./useActiveGame";
import { useMemo } from "react";
import { GAME_STATUS } from "../game/constants";

export interface BetEntry {
  wallet: string;
  betAmount: number;
  timestamp: number;
}

export interface GameState {
  roundId: number;
  status: "Waiting" | "Open" | "Closed";
  startTimestamp: number;
  endTimestamp: number;
  bets: BetEntry[];
  initialPot: number;
  winner: string | null;
  prizeSent: boolean;
  gameRoundPda: string;
  vaultPda: string;
}

export interface GameConfig {
  authority: string;
  treasury: string;
  houseFeeBasisPoints: number;
  minBetLamports: number;
  vrfFeeLamports: number;
  vrfNetworkState: string;
  vrfTreasury: string;
  gameLocked: boolean;
}

export function useGameState() {
  const { activeGame, isLoading } = useActiveGame();

  const formatStatus = (status: number): GameState["status"] => {
    if (status === GAME_STATUS.OPEN) return "Open";
    if (status === GAME_STATUS.CLOSED) return "Closed";
    return "Waiting";
  };

  const gameState: GameState | null = useMemo(() => {
    if (!activeGame) return null;

    const toNum = (v: any) => (typeof v === "number" ? v : Number(v) || 0);

    return {
      roundId: toNum(activeGame.gameRound ?? activeGame.roundId),
      status: formatStatus(toNum(activeGame.status)),
      startTimestamp: toNum(activeGame.startDate ?? activeGame.startTimestamp),
      endTimestamp: toNum(activeGame.endDate ?? activeGame.endTimestamp),
      bets:
        activeGame.bets?.map((bet: any, index: number) => ({
          wallet:
            activeGame.wallets?.[bet.walletIndex]?.toString() ||
            `Player ${index + 1}`,
          betAmount: toNum(bet.amount) / 1_000_000_000, // nanotons → TON
          timestamp: toNum(activeGame.startDate ?? activeGame.startTimestamp),
        })) || [],
      initialPot: toNum(activeGame.totalDeposit ?? activeGame.totalPot) / 1_000_000_000,
      winner: activeGame.winner?.toString() || null,
      prizeSent: activeGame.prizeSent ?? false,
      gameRoundPda: "ton-contract",
      vaultPda: "ton-contract",
    };
  }, [activeGame]);

  const gameConfig: GameConfig = useMemo(
    () => ({
      authority: "Backend Wallet",
      treasury: "Treasury Wallet",
      houseFeeBasisPoints: 500,
      minBetLamports: 0.01,
      vrfFeeLamports: 0,
      vrfNetworkState: "TON Testnet",
      vrfTreasury: "N/A",
      gameLocked: activeGame?.status === 1 || false,
    }),
    [activeGame]
  );

  return {
    gameState,
    gameConfig,
    vaultBalance: -1,
    loading: isLoading,
    error: null,
    refresh: () => {},
  };
}
