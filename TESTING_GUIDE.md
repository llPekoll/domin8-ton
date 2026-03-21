# Domin8 Testing Guide

## Overview

We have **two separate test suites** to handle the ORAO VRF integration challenge:

1. **Localnet Tests** - Fast iteration without VRF (tests core logic)
2. **Devnet Tests** - Full integration with real ORAO VRF

## Quick Start

### Localnet Tests (Recommended for Development)

```bash
# 1. Set cluster to localnet in Anchor.toml
# cluster = "localnet"

# 2. Run tests (builds, deploys, runs tests)
anchor test

# Or run without rebuild
anchor test --skip-build --skip-deploy

# Or use the specific script
anchor run test-localnet
```

**✅ What Works:**
- Configuration initialization
- PDA derivation
- Game counter tracking
- Emulated randomness logic

**⚠️ Limitations:**
- Cannot test `create_game` (requires ORAO VRF)
- Cannot test `place_bet` (requires game round)
- Cannot test `close_betting_window`
- Cannot test `select_winner_and_payout`

### Devnet Tests (Full VRF Integration)

```bash
# 1. Set cluster to devnet in Anchor.toml
# cluster = "devnet"

# 2. Deploy program to devnet (if not already deployed)
anchor deploy

# 3. Run tests (WITHOUT rebuild/redeploy)
anchor test --skip-build --skip-deploy

# Or use the specific script
anchor run test-devnet
```

**✅ What Works:**
- Everything from localnet tests
- Full ORAO VRF integration
- Complete game flow testing
- Real on-chain randomness

**⚠️ Known Issues:**
- State persists between test runs
- VRF request accounts may already exist from previous runs
- Tests handle this by finding unused round IDs

## Test Files

### 1. Localnet Tests
**File:** `/tests/localnet.test.ts`

**Purpose:** Fast iteration on core game logic without blockchain VRF dependencies.

**Key Features:**
- Emulated randomness function for testing winner selection logic
- Tests all non-VRF instructions
- Verifies PDA derivation is correct
- Validates configuration management

**Emulated VRF:**
```typescript
function emulateVrfRandomness(roundId: number, numParticipants: number): number {
  const seed = roundId * 12345 + numParticipants;
  return seed % numParticipants;
}
```

**Cluster Verification:**
```typescript
const isLocalnet = connection.rpcEndpoint.includes("localhost") ||
                   connection.rpcEndpoint.includes("127.0.0.1");

if (!isLocalnet) {
  throw new Error("These tests must run on LOCALNET");
}
```

### 2. Devnet Tests
**File:** `/tests/devnet.test.ts`

**Purpose:** Full end-to-end testing with real ORAO VRF on Solana devnet.

**Key Features:**
- Real ORAO VRF integration
- Complete game flow (create → bet → close → select winner)
- Verifiable randomness from blockchain
- Tests VRF seed determinism fix

**VRF Seed Generation (Deterministic):**
```typescript
function deriveVrfAccounts(roundId: number) {
  const seed = Buffer.alloc(32);
  seed.writeBigUInt64LE(BigInt(roundId), 0); // round_id at bytes 0-7
  // bytes 8-31 remain zero (deterministic!)

  const [vrfRequest] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("orao-vrf-randomness-request"), seed],
    VRF_PROGRAM_ID
  );
  return { vrfRequest, seed };
}
```

**Cluster Verification:**
```typescript
const isDevnet = connection.rpcEndpoint.includes("devnet");

if (!isDevnet) {
  throw new Error("These tests must run on DEVNET");
}
```

## Configuration (Anchor.toml)

```toml
[provider]
# ========================================
# CLUSTER CONFIGURATION
# ========================================
# Uncomment ONE of the following:

# LOCALNET (for fast testing without VRF)
cluster = "localnet"

# DEVNET (for full ORAO VRF integration)
# cluster = "devnet"

wallet = "/Users/peko/work/domin8/solana/7H9uSFKd1h4pvFPFfqzLpSZyLac7F9ax9ZcFtv9B5oDf.json"

[scripts]
# ========================================
# TEST SCRIPTS
# ========================================

# LOCALNET TESTS (no VRF, emulated randomness)
test-localnet = "NODE_OPTIONS='--loader ts-node/esm' yarn mocha -t 1000000 tests/localnet.test.ts"

# DEVNET TESTS (real ORAO VRF)
test-devnet = "NODE_OPTIONS='--loader ts-node/esm' yarn mocha -t 1000000 tests/devnet.test.ts"

# DEFAULT (runs localnet tests by default - fast iteration)
test = "NODE_OPTIONS='--loader ts-node/esm' yarn mocha -t 1000000 tests/localnet.test.ts"
```

## VRF Seed Fix (Critical!)

### The Problem
Originally, the VRF seed included `clock.unix_timestamp`:
```rust
// ❌ OLD (BROKEN)
fn generate_vrf_seed(round_id: u64, timestamp: i64) -> [u8; 32] {
    let mut seed = [0u8; 32];
    seed[0..8].copy_from_slice(&round_id.to_le_bytes());
    seed[8..16].copy_from_slice(&timestamp.to_le_bytes()); // ⚠️ PROBLEM!
    seed
}
```

**Why it broke:**
- Client needs to derive VRF request PDA **before** transaction
- Timestamp is only known **inside** the transaction
- Client can't predict the seed → ConstraintSeeds error

### The Fix
Use **only** `round_id` for deterministic seed generation:
```rust
// ✅ NEW (FIXED)
fn generate_vrf_seed(round_id: u64) -> [u8; 32] {
    let mut seed = [0u8; 32];
    seed[0..8].copy_from_slice(&round_id.to_le_bytes());
    // Rest of bytes remain zero - deterministic and predictable!
    seed
}
```

**Now:**
- Client can derive VRF request PDA before transaction
- Seed is deterministic (same round = same seed)
- Tests pass ✅

## Test Results

### Localnet Tests
```
✅ 8 tests passing
- Configuration initialization
- PDA derivation
- Game counter tracking
- Emulated randomness logic
- Configuration management
- Bets locked flag

⏱️ Runtime: ~3 seconds
💰 Cost: FREE (local validator)
```

### Devnet Tests
```
⚠️ Requires ORAO VRF on devnet
⚠️ State persists between runs
⚠️ Need to handle existing VRF accounts

📋 Comprehensive suite covering:
- Full game creation with VRF
- Multiple players betting
- Betting window closure
- Winner selection and payout
- Edge cases and security
```

## Common Issues

### Issue 1: "Not on localnet" Error
```
❌ ERROR: Not on localnet! Endpoint: https://api.devnet.solana.com
```

**Fix:** Update `Anchor.toml` to use `cluster = "localnet"`

### Issue 2: "VRF Program Not Executable"
```
AnchorError: Program account is not executable
```

**Fix:** This is expected on localnet (ORAO VRF not deployed). Use localnet tests which skip VRF calls.

### Issue 3: "VRF Request Account Already Exists" (Devnet)
```
Allocate: account Address already in use
```

**Fix:** Devnet state persists. Tests will automatically find an unused round ID, or wait for previous games to complete.

### Issue 4: "ConstraintSeeds" Error
```
Error Code: ConstraintSeeds
Left:  2vJKZsdtx1jRkADGmE8uLdsknHefvjxHUc3yX2Az617p
Right: EjG65UoHJGjqj7uoCyr4L2x2kErL1aX4py3QoQhYu5vX
```

**Fix:** This was the VRF seed timestamp issue. Now fixed with deterministic seeds (round_id only).

## Development Workflow

### 1. Fast Iteration (Localnet)
```bash
# Make changes to program
vim programs/domin8_prgm/src/instructions/create_game.rs

# Rebuild and test on localnet
anchor test

# Tests run in ~3 seconds
```

### 2. Full Integration Testing (Devnet)
```bash
# Set devnet in Anchor.toml
# cluster = "devnet"

# Deploy to devnet
anchor deploy

# Run devnet tests
anchor test --skip-build --skip-deploy

# Verify real VRF integration works
```

### 3. Before Production
```bash
# Run both test suites
anchor run test-localnet  # Fast sanity check
anchor run test-devnet    # Full integration

# Deploy to mainnet when both pass
```

## Best Practices

1. **Use localnet for development** - Faster feedback loop
2. **Use devnet before deploying** - Catch VRF integration issues
3. **Check cluster logs** - Tests show which cluster they're running on
4. **Handle devnet state** - Be aware state persists between runs
5. **Monitor VRF costs** - Each VRF request costs ~0.0001 SOL on devnet

## Next Steps

1. ✅ Localnet tests working (8 passing)
2. ⏳ Devnet tests need VRF account cleanup logic
3. 🎯 Add mainnet test suite (same as devnet but different cluster)
4. 📊 Add performance benchmarks
5. 🔐 Add security audit tests

## Summary

| Feature | Localnet | Devnet |
|---------|----------|--------|
| Speed | ⚡ Fast (~3s) | 🐢 Slower (~30s) |
| Cost | 💰 Free | 💰 Minimal (~0.001 SOL) |
| VRF | ❌ Emulated | ✅ Real ORAO |
| State | 🔄 Fresh | 💾 Persists |
| Use Case | Development | Integration |

**Recommendation:** Use **localnet for 90% of development**, devnet for final validation before deployment.

---

🎉 **Happy Testing!**
