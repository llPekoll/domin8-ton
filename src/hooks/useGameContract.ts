/**
 * useGameContract — TON version
 *
 * Wraps useTonGameContract with a convenient interface.
 * Components call placeBet(amount, skin, position) without knowing the game address.
 */

import { useCallback } from "react";
import { useTonGameContract } from "./useTonGameContract";
import { useActiveGame } from "./useActiveGame";
import { useSocket } from "../lib/socket";
import { Address } from "@ton/core";
import { getTonClient } from "../lib/tonClient";

const MASTER_ADDRESS = import.meta.env.VITE_TON_MASTER_ADDRESS || "";

export function useGameContract() {
  const {
    connected,
    walletAddress,
    tonBalance,
    isPlacingBet,
    placeBet: tonPlaceBet,
    validateBet: tonValidateBet,
    refreshBalance,
  } = useTonGameContract();

  const { activeGame } = useActiveGame();
  const { socket } = useSocket();

  /**
   * Place bet — placeBet(amount, skin, position)
   * Automatically resolves the game child contract address from the active game.
   */
  const placeBet = useCallback(
    async (amount: number, skin: number, position: [number, number]) => {
      if (!connected || !walletAddress) {
        throw new Error("Wallet not connected");
      }

      // Get the current game's child contract address from the master
      let gameAddress: string;
      if ((activeGame as any)?.gameAddress) {
        gameAddress = (activeGame as any).gameAddress;
      } else {
        // Fetch from master contract
        const client = getTonClient();
        const masterAddr = Address.parse(MASTER_ADDRESS);

        const configResult = await client.runMethod(masterAddr, "config", []);
        const stack = configResult.stack;
        stack.readAddress(); // admin
        stack.readAddress(); // treasury
        stack.readBigNumber(); // houseFee
        stack.readBigNumber(); // minBet
        stack.readBigNumber(); // maxBet
        stack.readBigNumber(); // roundTime
        const currentRound = stack.readBigNumber();

        const addrResult = await client.runMethod(masterAddr, "gameAddress", [
          { type: "int", value: currentRound },
        ]);
        gameAddress = addrResult.stack.readAddress().toString();
      }

      await tonPlaceBet(gameAddress, amount, skin, position);

      // Notify backend immediately — no polling needed
      // Backend will sync chain state and broadcast to all clients
      if (socket) {
        socket.emit("bet-placed", {
          gameAddress,
          walletAddress,
          amount,
          skin,
          position,
        });
      }

      // Return compat result
      return {
        signature: "ton_bet",
        roundId: activeGame?.roundId || 0,
        betIndex: activeGame?.betCount || 0,
      };
    },
    [connected, walletAddress, activeGame, tonPlaceBet]
  );

  /**
   * Validate bet — matches old interface
   */
  const validateBet = useCallback(
    async (amount: number) => {
      return tonValidateBet(amount);
    },
    [tonValidateBet]
  );

  /**
   * Check if user can place a bet
   */
  const canPlaceBet = useCallback(() => {
    return connected && tonBalance > 0.05;
  }, [connected, tonBalance]);

  /**
   * Get balance
   */
  const getBalance = useCallback(async () => {
    return tonBalance;
  }, [tonBalance]);

  return {
    placeBet,
    validateBet,
    canPlaceBet,
    getBalance,
    refreshBalance,
    isPlacingBet,
    connected,
    walletAddress,
  };
}
