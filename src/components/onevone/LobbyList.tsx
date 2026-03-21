import { useState, useCallback, useMemo, useEffect } from "react";
import { useActiveWallet } from "../../contexts/ActiveWalletContext";
import { useSocket, socketRequest } from "../../lib/socket";
import { useTonConnectUI } from "@tonconnect/ui-react";
import { toNano, beginCell } from "@ton/core";
import { toast } from "sonner";
import { logger } from "../../lib/logger";
import type { Character } from "../../types/character";

const OP_JOIN_LOBBY = 0xfbbd3a85;

interface LobbyData {
  _id: string;
  lobbyId: number;
  lobbyPda: string;
  shareToken: string;
  playerA: string;
  playerB?: string;
  amount: number;
  status: 0 | 1 | 2 | 3; // 0 = Open, 1 = Awaiting VRF, 2 = Ready, 3 = Resolved
  winner?: string;
  characterA: number;
  characterB?: number;
  mapId: number;
  isPrivate?: boolean;
}

interface LobbyListProps {
  lobbies: LobbyData[];
  currentPlayerWallet: string;
  selectedCharacter: Character | null;
  onLobbyJoined?: (lobbyId: number) => void;
  onLobbySelected?: (lobbyId: number) => void; // New: parent handles displaying the dialog
}

export function LobbyList({
  lobbies,
  currentPlayerWallet,
  selectedCharacter,
  onLobbyJoined,
  onLobbySelected,
}: LobbyListProps) {
  const { connected, walletAddress, activePublicKey: publicKey } = useActiveWallet();
  const wallet = walletAddress; // compat
  const { socket } = useSocket();
  const joinLobbyAction = useCallback(
    async (args: any) => {
      if (!socket) throw new Error("Not connected");
      const res = await socketRequest(socket, "join-lobby", args);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    [socket]
  );
  const [joiningLobbies, setJoiningLobbies] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"open" | "my">("open");
  
  logger.chain.debug("Rendering LobbyList with lobbies:", lobbies);

  // Filter lobbies based on active tab
  const openLobbies = lobbies.filter(
    (lobby) => lobby.playerA !== currentPlayerWallet && lobby.status === 0
  );
  const myLobbies = lobbies.filter(
    (lobby) => lobby.playerA === currentPlayerWallet && lobby.status === 0
  );
  const displayedLobbies = activeTab === "open" ? openLobbies : myLobbies;

  // Get unique playerA wallet addresses from open lobbies to fetch their display names
  const playerAWallets = useMemo(() => {
    return [...new Set(openLobbies.map((lobby) => lobby.playerA))];
  }, [openLobbies]);

  // Fetch player names for all playerA wallets via socket
  const [playerNames, setPlayerNames] = useState<any[] | null>(null);
  useEffect(() => {
    if (!socket || playerAWallets.length === 0) {
      setPlayerNames(null);
      return;
    }
    socketRequest(socket, "get-players-by-wallets", { walletAddresses: playerAWallets }).then((res) => {
      if (res.success) setPlayerNames(res.data);
    });
  }, [socket, playerAWallets.join(",")]);

  // Create a lookup map for quick access
  const playerNameMap = useMemo(() => {
    if (!playerNames) return new Map<string, string | null>();
    return new Map(playerNames.map((p) => [p.walletAddress, p.displayName]));
  }, [playerNames]);

  const [tonConnectUI] = useTonConnectUI();

  const handleJoinLobby = useCallback(
    async (lobby: LobbyData) => {
      if (!connected || !selectedCharacter || !wallet || !publicKey) {
        toast.error("Please connect wallet and select a character");
        return;
      }

      if (lobby.playerA === currentPlayerWallet) {
        toast.error("You cannot join your own lobby");
        return;
      }

      if (!lobby.lobbyPda) {
        toast.error("Lobby address not found");
        return;
      }

      setJoiningLobbies((prev) => new Set(prev).add(lobby.lobbyId));

      try {
        logger.ui.info("Joining lobby", {
          lobbyId: lobby.lobbyId,
          playerB: currentPlayerWallet,
          character: selectedCharacter.id,
        });

        // Step 1: Send JoinLobby tx to lobby child contract via TonConnect (actual payment)
        const betAmountTon = lobby.amount / 1e9;
        const totalAmount = toNano((betAmountTon + 0.05).toFixed(9)); // bet + gas

        const payload = beginCell()
          .storeUint(OP_JOIN_LOBBY, 32)
          .storeUint(0, 64) // queryId
          .storeUint(selectedCharacter.id, 8) // skin
          .endCell()
          .toBoc()
          .toString("base64");

        toast.loading("Confirm in your wallet...", { id: "join-lobby-tx" });

        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 300,
          messages: [
            {
              address: lobby.lobbyPda,
              amount: totalAmount.toString(),
              payload,
            },
          ],
        });

        // Step 2: Tell backend player B joined (triggers settlement)
        const lobbyData = await joinLobbyAction({
          playerB: currentPlayerWallet,
          lobbyId: lobby.lobbyId,
          characterB: selectedCharacter.id,
        });

        toast.success("You joined the lobby! Starting fight...", {
          id: "join-lobby-tx",
          duration: 5000,
        });

        onLobbyJoined?.(lobbyData?.lobbyId ?? lobby.lobbyId);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.ui.error("Failed to join lobby:", error);
        if (errorMsg.includes("Rejected") || errorMsg.includes("rejected")) {
          toast.error("Transaction rejected", { id: "join-lobby-tx" });
        } else {
          toast.error("Failed to join lobby: " + errorMsg, { id: "join-lobby-tx" });
        }
      } finally {
        setJoiningLobbies((prev) => {
          const next = new Set(prev);
          next.delete(lobby.lobbyId);
          return next;
        });
      }
    },
    [connected, wallet, publicKey, selectedCharacter, currentPlayerWallet, onLobbyJoined, joinLobbyAction]
  );

  const formatAmount = (nanotons: number) => {
    return (nanotons / 1e9).toFixed(3);
  };

  const handleCopyShareLink = useCallback(async (lobby: LobbyData, e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/1v1?join=${lobby.shareToken}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied!");
    } catch {
      toast.error("Failed to copy link");
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Header with Tab Navigation */}
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold text-amber-100">ALL GAMES</h2>
        <span className="text-amber-400 font-mono">{activeTab === "open" ? openLobbies.length : myLobbies.length}</span>

        {/* Tab Pills */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("open")}
            className={`px-4 py-1.5 rounded-lg font-semibold text-sm transition-all ${
              activeTab === "open"
                ? "bg-amber-600 text-white shadow-lg"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Open ({openLobbies.length})
          </button>
          <button
            onClick={() => setActiveTab("my")}
            className={`px-4 py-1.5 rounded-lg font-semibold text-sm transition-all ${
              activeTab === "my"
                ? "bg-amber-600 text-white shadow-lg"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            My Games ({myLobbies.length})
          </button>
        </div>
      </div>

      {/* Games List */}
      {displayedLobbies.length === 0 ? (
        <div className="text-center py-12 bg-linear-to-r from-gray-900/80 to-gray-950/80 rounded-xl border border-gray-700/50">
          <p className="text-gray-300 mb-2 font-medium">
            {activeTab === "open" ? "No open games at the moment" : "You have no active games"}
          </p>
          <p className="text-sm text-gray-500">
            {activeTab === "open" ? "Create one to get started!" : "Create a game to start playing!"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedLobbies.map((lobby) => {
            const rawName = activeTab === "open"
              ? playerNameMap.get(lobby.playerA) || lobby.playerA.slice(0, 4) + "..." + lobby.playerA.slice(-4)
              : "You";
            const playerAName = rawName.length > 20 ? rawName.slice(0, 20) + "…" : rawName;

            return (
              <div
                key={lobby._id}
                className={`rounded-xl p-4 cursor-pointer transition-all ${
                  lobby.isPrivate
                    ? "bg-linear-to-r from-purple-900/40 to-purple-950/40 border border-purple-500/30 hover:border-purple-400/50"
                    : "bg-linear-to-r from-gray-900/80 to-gray-950/80 border border-gray-700/50 hover:border-amber-600/50"
                }`}
                onClick={() => onLobbySelected?.(lobby.lobbyId)}
              >
                <div className="flex items-center justify-between">
                  {/* Player A */}
                  <div className="flex items-center gap-3 flex-1">
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center overflow-hidden ${
                        activeTab === "my"
                          ? "bg-linear-to-br from-amber-500 to-amber-700 border-amber-400"
                          : "bg-linear-to-br from-amber-600 to-amber-800 border-amber-500/50"
                      }`}>
                        <span className="text-white font-bold text-lg">
                          {playerAName[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-amber-600 text-2.5 text-white font-bold px-1.5 py-0.5 rounded-full border border-amber-400">
                        {lobby.characterA || 1}
                      </div>
                    </div>
                    <div>
                      <p className="text-white font-semibold">{playerAName}</p>
                    </div>
                  </div>

                  {/* VS Icon */}
                  <div className="flex items-center gap-4 px-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" className="text-amber-500" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 3l6 6M18 3l-6 6M6 21l6-6M18 21l-6-6" />
                    </svg>
                  </div>

                  {/* Player B (Waiting) */}
                  <div className="flex items-center gap-3 flex-1 justify-end">
                    <div>
                      <p className="text-gray-500 font-semibold italic">Waiting...</p>
                    </div>
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full bg-gray-800 border-2 border-dashed border-gray-600 flex items-center justify-center">
                        <span className="text-gray-500 text-2xl">?</span>
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-gray-700 text-2.5 text-gray-400 font-bold px-1.5 py-0.5 rounded-full border border-gray-600">
                        ?
                      </div>
                    </div>
                  </div>

                  {/* Amount & Actions */}
                  <div className="flex items-center gap-3 ml-6">
                    <div className="flex items-center gap-1 bg-gray-800/80 px-3 py-1.5 rounded-lg">
                      <span className="text-amber-400 font-bold text-xs">TON</span>
                      <span className="text-white font-bold">{formatAmount(lobby.amount)}</span>
                    </div>

                    {lobby.isPrivate && (
                      <span className="px-2 py-1 bg-purple-600/40 border border-purple-500/50 rounded text-purple-200 text-xs">
                        🔒
                      </span>
                    )}

                    {/* Join Button (only in Open tab) */}
                    {activeTab === "open" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJoinLobby(lobby);
                        }}
                        disabled={
                          joiningLobbies.has(lobby.lobbyId) ||
                          !connected ||
                          !selectedCharacter ||
                          lobby.playerA === currentPlayerWallet
                        }
                        className="px-6 py-2 bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all"
                      >
                        {joiningLobbies.has(lobby.lobbyId) ? "Joining..." : "Join"}
                      </button>
                    )}

                    {/* Share Button (in My Games tab) */}
                    {activeTab === "my" && (
                      <button
                        onClick={(e) => handleCopyShareLink(lobby, e)}
                        className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Copy share link"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                          <polyline points="16 6 12 2 8 6" />
                          <line x1="12" y1="2" x2="12" y2="15" />
                        </svg>
                      </button>
                    )}

                    {/* View Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLobbySelected?.(lobby.lobbyId);
                      }}
                      className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}