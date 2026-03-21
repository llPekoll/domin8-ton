/**
 * TON 1v1 Lobby Client
 *
 * Handles creating and settling 1v1 lobbies on the Domin8 TON contract.
 * Uses commit-reveal for randomness (same as arena).
 *
 * Flow:
 * 1. Player A: Frontend sends TON to master via TonConnect (CreateLobby msg)
 *    - But we need commit hash, so backend must create the lobby
 *    - Alternative: backend creates lobby, player A sends bet separately
 *
 * Simplified flow (backend-managed):
 * 1. Backend creates lobby on-chain with commit hash (player A's bet is forwarded)
 * 2. Player B joins directly via TonConnect (JoinLobby msg to child contract)
 * 3. Backend settles by revealing secret (SettleLobby msg via master)
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
import { config } from "../config.js";
import { db } from "../db/index.js";
import { gameSecrets as gameSecretsTable } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

// Opcodes from Tact ABI
const OP = {
  CreateLobby: 0xed0a8e4c,
  SettleLobby: 0x3caf0788,
  RescueLobby: 0x28941e49,
} as const;

function computeCommitHash(secret: bigint): bigint {
  const buf = Buffer.alloc(32);
  for (let i = 31; i >= 0; i--) {
    buf[31 - i] = Number((secret >> BigInt(i * 8)) & 0xffn);
  }
  const hash = sha256_sync(buf);
  return BigInt("0x" + Buffer.from(hash).toString("hex"));
}

function generateSecret(): { secret: bigint; commitHash: bigint } {
  const randomBytes = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    randomBytes[i] = Math.floor(Math.random() * 256);
  }
  const secret = BigInt("0x" + randomBytes.toString("hex"));
  return { secret, commitHash: computeCommitHash(secret) };
}

export class TonLobbyClient {
  private client: TonClient;
  private wallet!: WalletContractV4;
  private keyPair!: { publicKey: Buffer; secretKey: Buffer };
  private masterAddress: Address;
  private initialized = false;

  // Store secrets per lobby for reveal
  private lobbySecrets = new Map<number, bigint>();

  constructor() {
    const endpoint =
      config.tonNetwork === "mainnet"
        ? "https://toncenter.com/api/v2/jsonRPC"
        : "https://testnet.toncenter.com/api/v2/jsonRPC";

    this.client = new TonClient({
      endpoint,
      apiKey: config.tonCenterApiKey || undefined,
    });
    this.masterAddress = Address.parse(config.tonMasterAddress);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const keyPair = await mnemonicToPrivateKey(config.tonMnemonic.split(" "));
    this.keyPair = keyPair;
    this.wallet = WalletContractV4.create({
      publicKey: keyPair.publicKey,
      workchain: 0,
    });
    this.initialized = true;
    console.log(`[TonLobby] Initialized`);
  }

  private async sendMessage(to: Address, value: bigint, body: Cell): Promise<string> {
    await this.init();
    const contract = this.client.open(this.wallet);
    const seqno = await contract.getSeqno();

    await contract.sendTransfer({
      seqno,
      secretKey: this.keyPair.secretKey,
      messages: [internal({ to, value, body, bounce: true })],
    });

    // Wait for confirmation
    const start = Date.now();
    while (Date.now() - start < 30000) {
      const current = await contract.getSeqno();
      if (current > seqno) break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    return `ton_lobby_tx_${seqno}`;
  }

  /**
   * Get the current lobby count from master contract
   */
  async getLobbyCount(): Promise<number> {
    const result = await this.client.runMethod(this.masterAddress, "config", []);
    const stack = result.stack;
    stack.readAddress(); // admin
    stack.readAddress(); // treasury
    stack.readBigNumber(); // houseFee
    stack.readBigNumber(); // minBet
    stack.readBigNumber(); // maxBet
    stack.readBigNumber(); // roundTime
    stack.readBigNumber(); // currentRound
    const lobbyCount = Number(stack.readBigNumber());
    return lobbyCount;
  }

  /**
   * Get lobby child contract address
   */
  async getLobbyAddress(lobbyId: number): Promise<string> {
    const result = await this.client.runMethod(this.masterAddress, "lobbyAddress", [
      { type: "int", value: BigInt(lobbyId) },
    ]);
    return result.stack.readAddress().toString();
  }

  /**
   * Get lobby state from on-chain child contract
   */
  async getLobbyState(lobbyId: number): Promise<{
    lobbyId: number;
    status: number;
    playerA: string;
    playerB: string | null;
    amount: bigint;
    mapId: number;
    skinA: number;
    skinB: number;
    winner: string | null;
    createdAt: number;
    address: string;
  } | null> {
    try {
      const address = await this.getLobbyAddress(lobbyId);
      const addr = Address.parse(address);
      const result = await this.client.runMethod(addr, "state", []);
      const stack = result.stack;
      const lid = Number(stack.readBigNumber()); // lobbyId
      const status = Number(stack.readBigNumber()); // status
      const playerA = stack.readAddress().toString(); // playerA
      const playerB = stack.readAddressOpt()?.toString() ?? null; // playerB
      const amount = stack.readBigNumber(); // amount
      const mapId = Number(stack.readBigNumber()); // mapId
      const skinA = Number(stack.readBigNumber()); // skinA
      const skinB = Number(stack.readBigNumber()); // skinB
      const winner = stack.readAddressOpt()?.toString() ?? null; // winner
      const createdAt = Number(stack.readBigNumber()); // createdAt
      return { lobbyId: lid, status, playerA, playerB, amount, mapId, skinA, skinB, winner, createdAt, address };
    } catch (e) {
      // Contract may not exist yet or self-destructed
      return null;
    }
  }

  /**
   * Create a 1v1 lobby on-chain
   * The backend creates it (not the user) because we need the commit hash.
   * The user's bet amount is NOT sent here — user sends it separately via TonConnect.
   *
   * Actually, on TON the CreateLobby message requires TON attached (player A's bet).
   * Since the backend can't spend user funds, the flow is:
   * 1. Backend generates secret + commitHash
   * 2. Frontend sends CreateLobby to master with bet amount via TonConnect
   * 3. Backend stores the secret for later settlement
   *
   * For now: backend creates with its own funds (simplified), or we pass commitHash to frontend.
   */
  /**
   * Generate a commitHash for a new lobby.
   * Returns the secret + commitHash. Does NOT store anything yet.
   * Call `storeSecretForLobby()` after the real lobbyId is known.
   */
  generateCommitHash(): { secret: string; commitHash: string } {
    const { secret, commitHash } = generateSecret();
    return {
      secret: secret.toString(16),
      commitHash: commitHash.toString(),
    };
  }

  /**
   * Store a secret for a lobby ID (called after on-chain lobby is confirmed)
   */
  async storeSecretForLobby(lobbyId: number, secretHex: string): Promise<void> {
    const secret = BigInt("0x" + secretHex);
    this.lobbySecrets.set(lobbyId, secret);

    try {
      await db.insert(gameSecretsTable).values({
        roundId: lobbyId,
        secret: secretHex,
        commitHash: computeCommitHash(secret).toString(16),
        type: "lobby",
        createdAt: Math.floor(Date.now() / 1000),
      }).onConflictDoNothing();
    } catch (e) {
      console.warn("[TonLobby] Failed to persist secret to DB:", e);
    }

    console.log(`[TonLobby] Secret stored for lobby ${lobbyId}`);
  }

  /**
   * Settle a lobby by revealing the secret
   */
  async settleLobby(lobbyId: number): Promise<{
    txSignature: string;
    winner: string | null;
  }> {
    let secret = this.lobbySecrets.get(lobbyId);

    // Try loading from DB if not in memory (after server restart)
    if (!secret) {
      try {
        const [row] = await db
          .select()
          .from(gameSecretsTable)
          .where(
            and(
              eq(gameSecretsTable.roundId, lobbyId),
              eq(gameSecretsTable.type, "lobby"),
              eq(gameSecretsTable.revealed, false)
            )
          )
          .limit(1);
        if (row) {
          secret = BigInt("0x" + row.secret);
          this.lobbySecrets.set(lobbyId, secret);
          console.log(`[TonLobby] Secret recovered from DB for lobby ${lobbyId}`);
        }
      } catch (e) {
        console.warn("[TonLobby] Failed to load secret from DB:", e);
      }
    }

    if (!secret) {
      throw new Error(`No secret for lobby ${lobbyId}`);
    }

    // Verify lobby exists on-chain and is ready (status=1 means player B joined)
    const lobbyState = await this.getLobbyState(lobbyId);
    if (!lobbyState) {
      throw new Error(`Lobby ${lobbyId} not found on-chain — CreateLobby tx may not have been confirmed`);
    }
    if (lobbyState.status !== 1) {
      throw new Error(`Lobby ${lobbyId} status is ${lobbyState.status}, expected 1 (joined). Cannot settle.`);
    }
    console.log(`[TonLobby] Lobby ${lobbyId} verified on-chain: status=${lobbyState.status}, amount=${fromNano(lobbyState.amount)} TON`);

    const body = beginCell()
      .storeUint(OP.SettleLobby, 32)
      .storeUint(0, 64) // queryId
      .storeUint(lobbyId, 64)
      .storeUint(secret, 256)
      .endCell();

    const txSig = await this.sendMessage(
      this.masterAddress,
      toNano("0.1"),
      body
    );

    // Determine winner from secret (same logic as contract)
    const winner = secret % 2n === 0n ? "playerA" : "playerB";

    this.lobbySecrets.delete(lobbyId);

    // Mark as revealed in DB
    try {
      await db
        .update(gameSecretsTable)
        .set({ revealed: true })
        .where(
          and(
            eq(gameSecretsTable.roundId, lobbyId),
            eq(gameSecretsTable.type, "lobby")
          )
        );
    } catch (e) {
      console.warn("[TonLobby] Failed to mark secret as revealed:", e);
    }

    console.log(`[TonLobby] Lobby ${lobbyId} settled, winner: ${winner}`);

    return { txSignature: txSig, winner };
  }

  /**
   * Rescue a stuck lobby
   */
  async rescueLobby(lobbyId: number): Promise<string> {
    const body = beginCell()
      .storeUint(OP.RescueLobby, 32)
      .storeUint(0, 64)
      .storeUint(lobbyId, 64)
      .endCell();

    const txSig = await this.sendMessage(
      this.masterAddress,
      toNano("0.1"),
      body
    );

    console.log(`[TonLobby] Lobby ${lobbyId} rescued`);
    return txSig;
  }

  /**
   * Check if a secret is stored for a lobby
   */
  hasSecret(lobbyId: number): boolean {
    return this.lobbySecrets.has(lobbyId);
  }
}

// Singleton
let lobbyClient: TonLobbyClient | null = null;

export function getTonLobbyClient(): TonLobbyClient {
  if (!lobbyClient) {
    lobbyClient = new TonLobbyClient();
  }
  return lobbyClient;
}
