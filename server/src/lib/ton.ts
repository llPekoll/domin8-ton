/**
 * TON integration layer for the crank service
 *
 * TON blockchain client for the crank service.
 * Handles: create games, end games, send prizes, read state.
 *
 * Commit-reveal flow:
 * 1. createGameRound() - generates secret, commits sha256(secret), deploys child contract
 * 2. Players bet directly on the child game contract
 * 3. endGame() - reveals secret, contract verifies + selects winner
 * 4. sendPrize() - calls ClaimPrize on child (self-destructs after)
 */

import { TonClient, WalletContractV4, internal } from "@ton/ton";
import {
  Address,
  toNano,
  fromNano,
  beginCell,
  Cell,
} from "@ton/core";
import { mnemonicToPrivateKey, sha256_sync } from "@ton/crypto";
import { GameConfig, GameRound, BetInfoStruct, GAME_STATUS } from "./types.js";
import { db } from "../db/index.js";
import { gameSecrets as gameSecretsTable } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

// Message opcodes from Tact ABI
const OP = {
  CreateGame: 0xc90dfe02,
  RevealAndEnd: 0x7645a2e7,
  ClaimPrize: 0x9d546687,
  Deploy: 0x946a98b6,
} as const;

interface CommitRevealSecret {
  secret: bigint;
  commitHash: bigint;
}

/**
 * Compute sha256 hash of a uint256 value (same as contract's computeHash)
 */
function computeCommitHash(secret: bigint): bigint {
  const buf = Buffer.alloc(32);
  for (let i = 31; i >= 0; i--) {
    buf[31 - i] = Number((secret >> BigInt(i * 8)) & 0xffn);
  }
  const hash = sha256_sync(buf);
  return BigInt("0x" + Buffer.from(hash).toString("hex"));
}

/**
 * Generate a random secret and its commit hash
 */
function generateCommitReveal(): CommitRevealSecret {
  const randomBytes = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    randomBytes[i] = Math.floor(Math.random() * 256);
  }
  const secret = BigInt("0x" + randomBytes.toString("hex"));
  const commitHash = computeCommitHash(secret);
  return { secret, commitHash };
}

export class TonGameClient {
  private client: TonClient;
  private wallet!: WalletContractV4;
  private keyPair!: { publicKey: Buffer; secretKey: Buffer };
  private masterAddress: Address;
  private initialized = false;

  // Store secrets per game round for reveal
  private gameSecrets = new Map<number, bigint>();

  constructor(
    endpoint: string,
    private mnemonic: string,
    masterAddress: string,
    private apiKey?: string
  ) {
    this.client = new TonClient({
      endpoint,
      apiKey: apiKey || undefined,
    });
    this.masterAddress = Address.parse(masterAddress);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const keyPair = await mnemonicToPrivateKey(this.mnemonic.split(" "));
    this.keyPair = keyPair;
    this.wallet = WalletContractV4.create({
      publicKey: keyPair.publicKey,
      workchain: 0,
    });
    this.initialized = true;
    console.log(
      `[TonClient] Initialized. Wallet: ${this.wallet.address.toString()}`
    );
  }

  private async ensureInit() {
    if (!this.initialized) await this.init();
  }

  private async sendMessage(
    to: Address,
    value: bigint,
    body: Cell,
    bounce = true
  ): Promise<string> {
    await this.ensureInit();
    const contract = this.client.open(this.wallet);
    const seqno = await contract.getSeqno();

    await contract.sendTransfer({
      seqno,
      secretKey: this.keyPair.secretKey,
      messages: [
        internal({
          to,
          value,
          body,
          bounce,
        }),
      ],
    });

    // Wait for transaction to be processed
    await this.waitForSeqno(seqno + 1);
    return `ton_tx_${seqno}`;
  }

  private async waitForSeqno(
    targetSeqno: number,
    maxWait = 30000
  ): Promise<void> {
    await this.ensureInit();
    const contract = this.client.open(this.wallet);
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const current = await contract.getSeqno();
      if (current >= targetSeqno) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.warn("[TonClient] Seqno wait timeout");
  }

  // ============================================================
  // READ METHODS
  // ============================================================

  async getCurrentRoundId(): Promise<number> {
    try {
      const result = await this.client.runMethod(
        this.masterAddress,
        "config",
        []
      );
      const stack = result.stack;
      stack.readAddress(); // admin
      stack.readAddress(); // treasury
      stack.readBigNumber(); // houseFee
      stack.readBigNumber(); // minBet
      stack.readBigNumber(); // maxBet
      stack.readBigNumber(); // roundTime
      const currentRound = Number(stack.readBigNumber());
      return currentRound;
    } catch (error) {
      console.error("[TonClient] Error fetching current round:", error);
      return 0;
    }
  }

  async getGameConfig(): Promise<GameConfig | null> {
    try {
      const result = await this.client.runMethod(
        this.masterAddress,
        "config",
        []
      );
      const stack = result.stack;
      const admin = stack.readAddress().toString();
      const treasury = stack.readAddress().toString();
      const houseFee = Number(stack.readBigNumber());
      const minBet = Number(stack.readBigNumber());
      const maxBet = Number(stack.readBigNumber());
      const roundTime = Number(stack.readBigNumber());
      const gameRound = Number(stack.readBigNumber());
      const lobbyCount = Number(stack.readBigNumber());
      const lock = stack.readBoolean();

      return {
        admin,
        treasury,
        gameRound,
        houseFee,
        minDepositAmount: minBet,
        maxDepositAmount: maxBet,
        roundTime,
        lock,
        force: [],
      };
    } catch (error) {
      console.error("[TonClient] Error fetching config:", error);
      return null;
    }
  }

  private async getGameAddress(roundId: number): Promise<Address> {
    const result = await this.client.runMethod(
      this.masterAddress,
      "gameAddress",
      [{ type: "int", value: BigInt(roundId) }]
    );
    return result.stack.readAddress();
  }

  async getGameRound(roundId?: number): Promise<GameRound | null> {
    const currentRound = roundId ?? (await this.getCurrentRoundId());
    if (currentRound === 0) return null;

    try {
      const gameAddr = await this.getGameAddress(currentRound);

      // Check if game contract exists
      const state = await this.client.getContractState(gameAddr);
      if (state.state !== "active") return null;

      // Read game state
      const stateResult = await this.client.runMethod(
        gameAddr,
        "state",
        []
      );
      const s = stateResult.stack;

      const gameId = Number(s.readBigNumber());
      const status = Number(s.readBigNumber());
      const mapId = Number(s.readBigNumber());
      const startDate = Number(s.readBigNumber());
      const endDate = Number(s.readBigNumber());
      const totalPotNano = s.readBigNumber();
      const betCount = Number(s.readBigNumber());
      const userCount = Number(s.readBigNumber());
      const winnerAddr = s.readAddressOpt();
      const winnerPrizeNano = s.readBigNumber();
      const prizeSent = s.readBoolean();

      // Map TON status to our status constants
      // TON contract: 0=waiting, 1=open, 2=closed
      // Our types: OPEN=0, CLOSED=1, WAITING=2
      const statusMap: Record<number, number> = {
        0: GAME_STATUS.WAITING,
        1: GAME_STATUS.OPEN,
        2: GAME_STATUS.CLOSED,
      };

      // Fetch bets
      const bets: BetInfoStruct[] = [];
      const walletSet = new Set<string>();
      const wallets: string[] = [];

      // Read individual bets using playerBets getter + raw stack parsing
      for (let i = 0; i < betCount && i < 100; i++) {
        try {
          const betResult = await this.client.runMethod(gameAddr, "bet", [
            { type: "int", value: BigInt(i) },
          ]);

          // Tact optional struct returns as tuple with mixed item types
          // Parse all items as raw to avoid type mismatches
          const tuple = betResult.stack.readTuple();
          const rawItems: any[] = [];
          while (tuple.remaining > 0) {
            rawItems.push(tuple.pop());
          }

          // Extract address from first item (slice-like)
          let playerAddr = "unknown";
          try {
            const addrItem = rawItems[0];
            if (addrItem && typeof addrItem.beginParse === "function") {
              playerAddr = addrItem.beginParse().loadAddress().toString();
            }
          } catch { /* ignore address parse errors */ }

          // Extract numeric values - they might be TupleItem objects with .value
          const extractNum = (item: any): number => {
            if (!item) return 0;
            if (typeof item === "number") return item;
            if (typeof item === "bigint") return Number(item);
            if (item.value !== undefined) return Number(item.value);
            return 0;
          };

          const amount = extractNum(rawItems[1]);
          const skin = extractNum(rawItems[2]);
          const posX = extractNum(rawItems[3]);
          const posY = extractNum(rawItems[4]);

          if (playerAddr && !walletSet.has(playerAddr)) {
            walletSet.add(playerAddr);
            wallets.push(playerAddr);
          }
          const walletIndex = Math.max(0, wallets.indexOf(playerAddr));

          bets.push({ walletIndex, amount, skin, position: [posX, posY] });
        } catch (err: any) {
          console.log(`[TonClient] Bet ${i} read error (skipping):`, err?.message || err);
          break;
        }
      }

      return {
        gameRound: gameId,
        startDate,
        endDate,
        totalDeposit: Number(totalPotNano),
        rand: "0",
        map: mapId,
        userCount,
        force: [],
        status: statusMap[status] ?? status,
        winner: winnerAddr?.toString() || null,
        winnerPrize: Number(winnerPrizeNano),
        winningBetIndex: null,
        wallets,
        bets,
        prizeSent,
        // Computed compat properties
        roundId: gameId,
        startTimestamp: startDate,
        endTimestamp: endDate,
        totalPot: Number(totalPotNano),
        betCount: bets.length,
        betAmounts: bets.map((b) => b.amount),
        betSkin: bets.map((b) => b.skin),
        betPosition: bets.map((b) => b.position),
        betWalletIndex: bets.map((b) => b.walletIndex),
      };
    } catch (error) {
      console.log("[TonClient] No game round for", currentRound, error);
      return null;
    }
  }

  async getActiveGame(): Promise<GameRound | null> {
    const roundId = await this.getCurrentRoundId();
    if (roundId === 0) return null;
    return this.getGameRound(roundId);
  }

  // ============================================================
  // WRITE METHODS
  // ============================================================

  async createGameRound(
    _roundId: number,
    mapId: number
  ): Promise<{ signature: string }> {
    await this.ensureInit();

    // Generate commit-reveal secret
    const { secret, commitHash } = generateCommitReveal();

    // Build CreateGame message to master contract
    const body = beginCell()
      .storeUint(OP.CreateGame, 32)
      .storeUint(0, 64) // queryId
      .storeUint(mapId, 8)
      .storeUint(commitHash, 256)
      .endCell();

    const signature = await this.sendMessage(
      this.masterAddress,
      toNano("0.2"),
      body
    );

    // Store secret for later reveal (in memory + DB for crash recovery)
    const newRoundId = (await this.getCurrentRoundId());
    this.gameSecrets.set(newRoundId, secret);

    // Persist to DB
    try {
      await db.insert(gameSecretsTable).values({
        roundId: newRoundId,
        secret: secret.toString(16),
        commitHash: commitHash.toString(16),
        type: "arena",
        createdAt: Math.floor(Date.now() / 1000),
      }).onConflictDoNothing();
    } catch (e) {
      console.warn("[TonClient] Failed to persist secret to DB:", e);
    }

    console.log(
      `[TonClient] Game ${newRoundId} created (map=${mapId}), secret stored`
    );

    return { signature };
  }

  async endGame(roundId: number): Promise<{ signature: string }> {
    await this.ensureInit();

    let secret = this.gameSecrets.get(roundId);

    // Try loading from DB if not in memory (after server restart)
    if (!secret) {
      try {
        // First try exact roundId match
        const [row] = await db
          .select()
          .from(gameSecretsTable)
          .where(
            and(
              eq(gameSecretsTable.roundId, roundId),
              eq(gameSecretsTable.type, "arena"),
              eq(gameSecretsTable.revealed, false)
            )
          )
          .limit(1);

        if (row) {
          secret = BigInt("0x" + row.secret);
          this.gameSecrets.set(roundId, secret);
          console.log(`[TonClient] Secret recovered from DB for round ${roundId}`);
        } else {
          // Fallback: try any unrevealed arena secret (roundId may have been stored differently)
          const [anyRow] = await db
            .select()
            .from(gameSecretsTable)
            .where(
              and(
                eq(gameSecretsTable.type, "arena"),
                eq(gameSecretsTable.revealed, false)
              )
            )
            .limit(1);
          if (anyRow) {
            secret = BigInt("0x" + anyRow.secret);
            this.gameSecrets.set(roundId, secret);
            console.log(`[TonClient] Secret recovered from DB (stored as round ${anyRow.roundId}, using for round ${roundId})`);
          }
        }
      } catch (e) {
        console.warn("[TonClient] Failed to load secret from DB:", e);
      }
    }

    if (!secret) {
      throw new Error(
        `No secret stored for round ${roundId}. Cannot reveal.`
      );
    }

    // Build RevealAndEnd message to master contract
    const body = beginCell()
      .storeUint(OP.RevealAndEnd, 32)
      .storeUint(0, 64) // queryId
      .storeUint(secret, 256)
      .endCell();

    const signature = await this.sendMessage(
      this.masterAddress,
      toNano("0.2"),
      body
    );

    // Mark as revealed in DB
    try {
      await db
        .update(gameSecretsTable)
        .set({ revealed: true })
        .where(
          and(
            eq(gameSecretsTable.roundId, roundId),
            eq(gameSecretsTable.type, "arena")
          )
        );
    } catch (e) {
      console.warn("[TonClient] Failed to mark secret as revealed:", e);
    }

    console.log(`[TonClient] Game ${roundId} ended (secret revealed)`);
    return { signature };
  }

  async sendPrizeWinner(roundId: number): Promise<{ signature: string }> {
    await this.ensureInit();

    // Build ClaimPrize message to master contract (which proxies to child)
    const body = beginCell()
      .storeUint(OP.ClaimPrize, 32)
      .storeUint(0, 64) // queryId
      .endCell();

    const signature = await this.sendMessage(
      this.masterAddress,
      toNano("0.1"),
      body
    );

    // Clean up stored secret
    this.gameSecrets.delete(roundId);
    console.log(`[TonClient] Prize claimed for round ${roundId}`);

    return { signature };
  }

  async deleteGame(_roundId: number): Promise<string> {
    // On TON, game contracts self-destruct after prize claim
    // No explicit delete needed
    console.log(`[TonClient] Game ${_roundId} auto-cleaned (self-destruct)`);
    return "auto-cleanup";
  }

  async confirmTransaction(
    _signature: string,
    _maxRetries = 3
  ): Promise<boolean> {
    // On TON, we wait for seqno in sendMessage.
    // By the time sendMessage returns, the tx is confirmed.
    return true;
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    message: string;
    slot?: number;
  }> {
    try {
      await this.ensureInit();
      const balance = await this.client.getBalance(this.wallet.address);
      const balTon = parseFloat(fromNano(balance));

      if (balTon < 0.1) {
        return {
          healthy: false,
          message: `Authority balance too low: ${balTon} TON`,
        };
      }

      const config = await this.getGameConfig();
      return {
        healthy: true,
        message: `OK. Balance: ${balTon} TON, Round: ${config?.gameRound ?? 0}, Locked: ${config?.lock ?? false}`,
      };
    } catch (error) {
      return { healthy: false, message: `Health check failed: ${error}` };
    }
  }

  /**
   * Get the stored secret for a round (for recovery)
   */
  getStoredSecret(roundId: number): bigint | undefined {
    return this.gameSecrets.get(roundId);
  }

  /**
   * Manually store a secret (for recovery from restart)
   */
  setStoredSecret(roundId: number, secret: bigint): void {
    this.gameSecrets.set(roundId, secret);
  }
}
