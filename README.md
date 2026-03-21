# Domin8 — Battle Royale Betting Game on TON

A fast-paced battle royale and 1v1 betting game on TON blockchain. Players bet on themselves in real-time battles with verifiable randomness via commit-reveal.

## Tech Stack

- **Runtime**: Bun
- **Backend**: Hono + Socket.io + Drizzle + Postgres
- **Frontend**: React + TypeScript + Vite
- **Game Engine**: Phaser.js
- **Blockchain**: TON (Tact smart contracts)
- **Wallet**: TonConnect (Tonkeeper, MyTonWallet, Telegram)
- **Styling**: Tailwind CSS

## Quick Start

```bash
# Install dependencies
bun install

# Start frontend + backend
bun run dev

# Frontend only
bun run dev:frontend

# Backend only
bun run dev:backend
```

## Project Structure

```
/
├── contracts/                 # TON smart contracts (Tact)
│   ├── tact/
│   │   └── domin8.tact        # 3 contracts: Master, Game, Lobby
│   ├── tests/
│   │   └── domin8.spec.ts     # 14 tests
│   ├── scripts/
│   │   ├── deploy.ts          # Deploy to testnet/mainnet
│   │   ├── balance.ts         # Check wallet balance
│   │   ├── gen-wallet.ts      # Generate deploy wallet
│   │   └── send.ts            # Send TON
│   └── build/                 # Generated wrappers + bytecode
├── server/                    # Hono backend
│   └── src/
│       ├── game/              # Game loop, actions, queries
│       ├── routes/            # API routes
│       ├── socket/            # Socket.io handlers
│       └── db/                # Drizzle schema
├── src/                       # React frontend
│   ├── game/                  # Phaser scenes + managers
│   ├── components/            # React UI
│   ├── hooks/                 # React hooks
│   │   ├── useTonWallet.ts       # Wallet connection
│   │   ├── useTonGameContract.ts # Bet, join, claim
│   │   ├── useTonGameState.ts    # Battle royale state
│   │   └── useTonLobbyState.ts   # 1v1 lobby state
│   ├── contexts/              # TonConnect wallet context
│   └── lib/                   # TonClient, socket, utils
└── public/
    └── assets/                # Sprites, maps, sounds
```

## Smart Contracts

3 Tact contracts on TON:

| Contract | Purpose | Lifecycle |
|----------|---------|-----------|
| **Domin8** | Config, game factory, fee router | Permanent |
| **Domin8Game** | Battle royale round | Ephemeral (self-destructs after payout) |
| **Domin8Lobby** | 1v1 coinflip | Ephemeral (self-destructs after settle) |

### Randomness: Commit-Reveal

1. Backend commits `sha256(secret)` at game creation
2. Players bet during countdown
3. Backend reveals `secret` after betting closes
4. Contract verifies hash and selects winner

### Contract Commands

```bash
cd contracts
bun install

# Build
bun run build

# Test (14 tests)
bun run test

# Deploy
bun run deploy:testnet

# Utils
bun run gen:wallet
bun run balance
```

## Game Modes

### Battle Royale

- Convex creates game with committed randomness
- Players bet TON (min 0.01, max 10)
- 60s countdown, weighted random winner selection
- Multi-player: 95% to winner, 5% house fee
- Single player: 100% refund

### 1v1 Coinflip

- Player A creates lobby with bet
- Player B joins with matching bet
- Backend reveals secret → coinflip (secret % 2)
- Winner gets 95%, house gets 5%
- Rescue mechanism if stuck > 1 hour

## Environment Variables

### Frontend

```env
VITE_TON_NETWORK=testnet
VITE_TON_MASTER_ADDRESS=EQAXGsQ1oiKzW0GReIfbQcGkeGxbH56pjik_Vhq7DH8_2Oyi
VITE_TONCENTER_API_KEY=your_key
VITE_TONCONNECT_MANIFEST_URL=https://your-domain/tonconnect-manifest.json
VITE_SERVER_URL=http://localhost:3002
```

### Backend (server/.env)

```env
DATABASE_URL=postgres://user:pass@host:5432/domin8
TON_NETWORK=testnet
TON_MASTER_ADDRESS=EQAXGsQ1oiKzW0GReIfbQcGkeGxbH56pjik_Vhq7DH8_2Oyi
TON_MNEMONIC=your 24 word mnemonic
TONCENTER_API_KEY=your_key
```

## Deployed Contracts (Testnet)

- **Master**: `EQAXGsQ1oiKzW0GReIfbQcGkeGxbH56pjik_Vhq7DH8_2Oyi`
- **Explorer**: [tonscan](https://testnet.tonscan.org/address/kQAXGsQ1oiKzW0GReIfbQcGkeGxbH56pjik_Vhq7DH8_2Fco)

## Resources

- [Tact Language](https://docs.tact-lang.org/)
- [TON Documentation](https://docs.ton.org/)
- [TonConnect](https://docs.ton.org/develop/dapps/ton-connect/overview)
- [Phaser.js](https://phaser.io/docs)
- [Hono](https://hono.dev/)
- [Drizzle ORM](https://orm.drizzle.team/)
