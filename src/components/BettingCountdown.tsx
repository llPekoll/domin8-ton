import { useEffect, useState } from "react";
import { useGameState } from "../hooks/useGameState";

export function BettingCountdown() {
  const { gameState, gameConfig } = useGameState();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    if (!gameState || !gameState.endTimestamp || gameState.status !== "Waiting") {
      return;
    }

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000); // Current time in seconds
      const endTime = gameState.endTimestamp;
      const remaining = endTime - now;

      setTimeRemaining(Math.max(0, remaining));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [gameState?.endTimestamp, gameState?.status]);

  if (!gameState || gameState.status !== "Waiting") {
    return null;
  }

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const progress = gameState.endTimestamp && gameState.startTimestamp
    ? ((gameState.endTimestamp - Math.floor(Date.now() / 1000)) / (gameState.endTimestamp - gameState.startTimestamp)) * 100
    : 0;

  // Determine color based on time remaining
  const getColor = () => {
    if (timeRemaining > 20) return "text-green-400";
    if (timeRemaining > 10) return "text-yellow-400";
    return "text-red-400";
  };

  const getBarColor = () => {
    if (timeRemaining > 20) return "bg-green-500";
    if (timeRemaining > 10) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">Betting closes in:</span>
        {gameConfig?.gameLocked && (
          <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">
            🔒 Locked
          </span>
        )}
      </div>

      <div className="text-center mb-3">
        {timeRemaining > 0 ? (
          <div className={`text-4xl font-bold ${getColor()} font-mono`}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
        ) : (
          <div className="text-2xl font-bold text-red-500">
            ⏰ Betting Closed
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${getBarColor()}`}
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>

      {/* Additional info */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        {gameState.bets.length} {gameState.bets.length === 1 ? 'player' : 'players'} joined
      </div>
    </div>
  );
}
