import { useState, useCallback } from "react";
import { useActiveWallet } from "../../contexts/ActiveWalletContext";
import { useSocket, socketRequest } from "../../lib/socket";
import { useTonConnectUI } from "@tonconnect/ui-react";
import { toNano, beginCell } from "@ton/core";
import { toast } from "sonner";
import { logger } from "../../lib/logger";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SpriteAnimator } from "../SpriteAnimator";
import type { Character } from "../../types/character";

const MASTER_ADDRESS = import.meta.env.VITE_TON_MASTER_ADDRESS || "";
const OP_CREATE_LOBBY = 0xed0a8e4c;

interface CreateLobbyProps {
  selectedCharacter: Character | null;
  characters: Character[];
  onCharacterChange: (direction: "prev" | "next") => void;
  onLobbyCreated?: (lobbyId: number) => void;
}

const DEFAULT_BET_AMOUNT = 0.1;

export function CreateLobby({
  selectedCharacter,
  characters,
  onCharacterChange,
  onLobbyCreated,
}: CreateLobbyProps) {
  const { connected, activePublicKey: publicKey } = useActiveWallet();
  const { socket } = useSocket();
  const [tonConnectUI] = useTonConnectUI();

  const [betAmount, setBetAmount] = useState<number>(DEFAULT_BET_AMOUNT);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    if (value >= 0 && value <= 100) {
      setBetAmount(value);
    }
  }, []);

  const handleCreateLobby = useCallback(async () => {
    if (!connected || !publicKey || !selectedCharacter || !socket) {
      toast.error("Please connect wallet and select a character");
      return;
    }

    if (betAmount <= 0) {
      toast.error("Bet amount must be greater than 0");
      return;
    }

    setIsLoading(true);
    try {
      const betAmountNanotons = Math.floor(betAmount * 1e9);

      logger.ui.info("Starting lobby creation process", {
        playerA: publicKey.toString(),
        amount: betAmountNanotons,
        character: selectedCharacter.id,
      });

      // Step 1: Get secret + commitHash from backend (nothing stored yet)
      const prepareRes = await socketRequest(socket, "prepare-lobby", {});
      if (!prepareRes.success) throw new Error(prepareRes.error);
      const { secret, commitHash } = prepareRes.data;

      // Step 2: Send CreateLobby tx to master contract via TonConnect (actual payment)
      const commitHashBigInt = BigInt(commitHash);
      const payload = beginCell()
        .storeUint(OP_CREATE_LOBBY, 32)
        .storeUint(0, 64) // queryId
        .storeUint(0, 8)  // mapId
        .storeUint(selectedCharacter.id, 8) // skin
        .storeUint(commitHashBigInt, 256) // commitHash
        .endCell()
        .toBoc()
        .toString("base64");

      // Bet + 0.15 TON gas for deploy+config
      const totalAmount = toNano((betAmount + 0.15).toFixed(9));

      toast.loading("Confirm in your wallet...", { id: "create-lobby-tx" });

      // This throws if user cancels — lobby won't be recorded
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [
          {
            address: MASTER_ADDRESS,
            amount: totalAmount.toString(),
            payload,
          },
        ],
      });

      // Step 3: Tx sent — backend polls chain for confirmation, stores secret, creates DB entry
      toast.loading("Waiting for blockchain confirmation...", { id: "create-lobby-tx" });
      const confirmRes = await socketRequest(socket, "confirm-lobby", {
        secret,
        playerA: publicKey.toString(),
        amount: betAmountNanotons,
        characterA: selectedCharacter.id,
        mapId: 0,
        isPrivate,
      }, 45_000);
      if (!confirmRes.success) throw new Error(confirmRes.error);
      const lobbyData = confirmRes.data;

      toast.success(`Lobby #${lobbyData.lobbyId} created! Waiting for Player B...`, {
        id: "create-lobby-tx",
        duration: 5000,
      });

      onLobbyCreated?.(lobbyData.lobbyId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.ui.error("Failed to create lobby:", error);
      if (errorMsg.includes("Rejected") || errorMsg.includes("rejected")) {
        toast.error("Transaction rejected", { id: "create-lobby-tx" });
      } else if (errorMsg.includes("Insufficient")) {
        toast.error(`Insufficient TON. Need: ~${(betAmount + 0.15).toFixed(3)} TON`, { id: "create-lobby-tx" });
      } else {
        toast.error("Failed to create lobby: " + errorMsg, { id: "create-lobby-tx" });
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    connected,
    publicKey,
    selectedCharacter,
    socket,
    betAmount,
    isPrivate,
    tonConnectUI,
    onLobbyCreated,
  ]);

  if (!connected || !publicKey) {
    return null;
  }

  return (
    <div className="py-2">
      {/* Mobile: Stack vertically, Desktop: Single row */}
      <div className="flex flex-col gap-3 md:gap-4">
        {/* Title - always visible */}
        <h1 className="text-2xl md:text-4xl font-black text-amber-100 tracking-wide text-center md:text-left">
          1V1 BATTLE
        </h1>

        {/* Controls - stack on mobile, row on desktop */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          {/* Character Selector */}
          <div className="flex items-center justify-center md:justify-start gap-1 bg-black/40 border border-amber-700/50 rounded-lg px-2 py-1">
            <button
              onClick={() => onCharacterChange("prev")}
              disabled={isLoading || characters.length <= 1}
              className="p-1 hover:bg-amber-700/30 rounded transition-colors disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5 text-amber-300" />
            </button>

            <div className="flex items-center gap-2 w-35 md:w-40 justify-center">
              {selectedCharacter && (
                <>
                  <div className="w-10 shrink-0 flex items-center justify-center">
                    <SpriteAnimator
                      assetPath={selectedCharacter.assetPath}
                      animation="idle"
                      size={40}
                      scale={1.8}
                    />
                  </div>
                  <span className="text-amber-100 font-bold text-sm uppercase tracking-wide truncate">
                    {selectedCharacter.name}
                  </span>
                </>
              )}
              {!selectedCharacter && <span className="text-gray-400 text-sm">Select</span>}
            </div>

            <button
              onClick={() => onCharacterChange("next")}
              disabled={isLoading || characters.length <= 1}
              className="p-1 hover:bg-amber-700/30 rounded transition-colors disabled:opacity-50"
            >
              <ChevronRight className="w-5 h-5 text-amber-300" />
            </button>
          </div>

          {/* Bet Amount Input with Increment Buttons */}
          <div className="flex items-center justify-center md:justify-start gap-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 font-bold text-xs">
                TON
              </span>
              <input
                type="number"
                value={betAmount}
                onChange={handleAmountChange}
                min="0.001"
                max="100"
                step="0.001"
                className="w-28 md:w-32 px-3 py-2 pl-12 bg-black/30 border border-amber-700/50 rounded-lg text-amber-100 placeholder-amber-600 text-center font-bold focus:outline-none focus:border-amber-500"
                disabled={isLoading}
                placeholder="0.1"
              />
            </div>

            <button
              onClick={() => setBetAmount((prev) => Math.min(prev + 0.1, 100))}
              disabled={isLoading}
              className="px-2 md:px-3 py-2 bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/50 rounded-lg text-amber-300 font-bold transition-colors disabled:opacity-50 text-sm md:text-base"
            >
              +0.1
            </button>
            <button
              onClick={() => setBetAmount((prev) => Math.min(prev + 1, 100))}
              disabled={isLoading}
              className="px-2 md:px-3 py-2 bg-amber-800/30 hover:bg-amber-700/40 border border-amber-600/50 rounded-lg text-amber-300 font-bold transition-colors disabled:opacity-50 text-sm md:text-base"
            >
              +1
            </button>
          </div>

          {/* Private Toggle + Create Button Row */}
          <div className="flex items-center justify-center md:justify-start gap-3 md:gap-4">
            {/* Private Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                onClick={() => setIsPrivate(!isPrivate)}
                disabled={isLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                  isPrivate ? "bg-amber-600" : "bg-gray-600"
                } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isPrivate ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-amber-300 font-medium">Private</span>
            </label>

            {/* Create Game Button */}
            <button
              onClick={handleCreateLobby}
              disabled={isLoading || !selectedCharacter || betAmount <= 0}
              className="flex-1 md:flex-none px-4 md:px-6 py-2 bg-linear-to-b from-amber-500 to-amber-700 hover:to-amber-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-amber-100 font-bold rounded-lg uppercase tracking-wider transition-all shadow-lg text-sm md:text-base"
            >
              {isLoading ? "Creating..." : "Create Game"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
