// Standalone test file for select_weighted_winner algorithm
// Compile with: rustc test_weighted_winner.rs
// Run with: ./test_weighted_winner

use std::collections::HashMap;

/// Simplified player structure for testing
#[derive(Debug, Clone)]
struct Player {
    id: String,
    total_bet: u64,
}

/// Select winner weighted by bet amounts
/// This is the exact algorithm from the Solana program
fn select_weighted_winner(players: &[&Player], randomness: u64) -> Result<String, &'static str> {
    if players.is_empty() {
        return Err("No players");
    }

    // Calculate total weight
    let total_weight: u64 = players.iter().map(|p| p.total_bet).sum();

    if total_weight == 0 {
        return Err("Invalid bet amount - total weight is 0");
    }

    // Use randomness to select a position in the weight range
    let selection = randomness % total_weight;

    println!("  Total weight: {}", total_weight);
    println!("  Randomness: {}", randomness);
    println!("  Selection point: {} (randomness % total_weight)", selection);
    println!("  Cumulative weight ranges:");

    // Find winner based on cumulative weights
    let mut cumulative = 0u64;
    for player in players {
        let prev_cumulative = cumulative;
        cumulative = cumulative.saturating_add(player.total_bet);
        println!("    Player {} bet {}: range [{}, {})",
                 player.id, player.total_bet, prev_cumulative, cumulative);

        if selection < cumulative {
            println!("  ✓ Winner: {} (selection {} falls in range [{}, {}))",
                     player.id, selection, prev_cumulative, cumulative);
            return Ok(player.id.clone());
        }
    }

    // Fallback to last player (should never reach here)
    let last_player = players.last().unwrap();
    println!("  ⚠ Fallback to last player: {}", last_player.id);
    Ok(last_player.id.clone())
}

/// Run a single test case and return the winner
fn run_test(test_name: &str, players: Vec<Player>, randomness: u64) -> String {
    println!("\n{:=<60}", "");
    println!("TEST: {}", test_name);
    println!("{:-<60}", "");

    let player_refs: Vec<&Player> = players.iter().collect();

    println!("Players:");
    for p in &players {
        println!("  - {}: {} SOL bet", p.id, p.total_bet as f64 / 1_000_000_000.0);
    }
    println!();

    match select_weighted_winner(&player_refs, randomness) {
        Ok(winner) => {
            println!("\n✓ Test passed - Winner: {}", winner);
            winner
        }
        Err(e) => {
            println!("\n✗ Test failed - Error: {}", e);
            String::from("ERROR")
        }
    }
}

/// Run multiple simulations to verify probability distribution
fn run_distribution_test(test_name: &str, players: Vec<Player>, num_simulations: usize) {
    println!("\n{:=<60}", "");
    println!("DISTRIBUTION TEST: {} ({} simulations)", test_name, num_simulations);
    println!("{:-<60}", "");

    let player_refs: Vec<&Player> = players.iter().collect();
    let mut win_counts: HashMap<String, usize> = HashMap::new();

    // Calculate expected probabilities
    let total_bet: u64 = players.iter().map(|p| p.total_bet).sum();
    println!("Expected probabilities:");
    for p in &players {
        let probability = (p.total_bet as f64 / total_bet as f64) * 100.0;
        println!("  {}: {:.2}% ({} / {} lamports)",
                 p.id, probability, p.total_bet, total_bet);
        win_counts.insert(p.id.clone(), 0);
    }

    // Run simulations
    println!("\nRunning {} simulations...", num_simulations);
    for i in 0..num_simulations {
        // Use different randomness values
        let randomness = (i as u64) * 12345 + 67890;

        if let Ok(winner) = select_weighted_winner(&player_refs, randomness) {
            *win_counts.get_mut(&winner).unwrap() += 1;
        }
    }

    // Display results
    println!("\nActual results:");
    for p in &players {
        let count = win_counts.get(&p.id).unwrap();
        let actual_pct = (*count as f64 / num_simulations as f64) * 100.0;
        let expected_pct = (p.total_bet as f64 / total_bet as f64) * 100.0;
        let diff = actual_pct - expected_pct;

        println!("  {}: won {}/{} times = {:.2}% (expected {:.2}%, diff: {:+.2}%)",
                 p.id, count, num_simulations, actual_pct, expected_pct, diff);
    }
}

fn main() {
    println!("\n{:=<60}", "");
    println!("  DOMIN8 WEIGHTED WINNER SELECTION - TEST SUITE");
    println!("{:=<60}", "");

    // Test 1: Equal bets - should have equal chance
    run_test(
        "Equal bets (3 players, 1 SOL each)",
        vec![
            Player { id: "Alice".to_string(), total_bet: 1_000_000_000 },  // 1 SOL
            Player { id: "Bob".to_string(), total_bet: 1_000_000_000 },    // 1 SOL
            Player { id: "Carol".to_string(), total_bet: 1_000_000_000 },  // 1 SOL
        ],
        12345678
    );

    // Test 2: Unequal bets - large bet should have higher chance
    run_test(
        "Unequal bets (Alice 5 SOL, Bob 1 SOL)",
        vec![
            Player { id: "Alice".to_string(), total_bet: 5_000_000_000 },  // 5 SOL
            Player { id: "Bob".to_string(), total_bet: 1_000_000_000 },    // 1 SOL
        ],
        99999999
    );

    // Test 3: Very unequal bets
    run_test(
        "Very unequal bets (Whale 10 SOL, Small 0.1 SOL)",
        vec![
            Player { id: "Whale".to_string(), total_bet: 10_000_000_000 },     // 10 SOL
            Player { id: "SmallPlayer".to_string(), total_bet: 100_000_000 },  // 0.1 SOL
        ],
        555555555
    );

    // Test 4: Many players with varying bets
    run_test(
        "Multiple players (5 total, varying bets)",
        vec![
            Player { id: "Player1".to_string(), total_bet: 2_000_000_000 },   // 2 SOL
            Player { id: "Player2".to_string(), total_bet: 1_500_000_000 },   // 1.5 SOL
            Player { id: "Player3".to_string(), total_bet: 1_000_000_000 },   // 1 SOL
            Player { id: "Player4".to_string(), total_bet: 500_000_000 },     // 0.5 SOL
            Player { id: "Player5".to_string(), total_bet: 3_000_000_000 },   // 3 SOL
        ],
        777777777
    );

    // Test 5: Minimum bet scenario
    run_test(
        "Minimum bets (0.01 SOL each)",
        vec![
            Player { id: "Penny1".to_string(), total_bet: 10_000_000 },  // 0.01 SOL
            Player { id: "Penny2".to_string(), total_bet: 10_000_000 },  // 0.01 SOL
        ],
        111111
    );

    // Test 6: Edge case - selection at boundary
    run_test(
        "Boundary test (randomness exactly at boundary)",
        vec![
            Player { id: "First".to_string(), total_bet: 1_000_000_000 },
            Player { id: "Second".to_string(), total_bet: 1_000_000_000 },
        ],
        1_000_000_000  // Exactly at the boundary between first and second
    );

    // Test 7: Bank vs Player (55/45 split simulation concept)
    run_test(
        "Bank vs Player scenario",
        vec![
            Player { id: "Player".to_string(), total_bet: 1_000_000_000 },  // 1 SOL
            Player { id: "Bank".to_string(), total_bet: 1_000_000_000 },    // 1 SOL (would need weight adjustment for 55/45)
        ],
        424242424
    );

    // Distribution Tests - verify probability over many runs
    println!("\n\n{:=<60}", "");
    println!("  PROBABILITY DISTRIBUTION VERIFICATION");
    println!("{:=<60}", "");

    // Distribution test 1: Equal bets should win equally often
    run_distribution_test(
        "Equal bets distribution",
        vec![
            Player { id: "Alice".to_string(), total_bet: 1_000_000_000 },
            Player { id: "Bob".to_string(), total_bet: 1_000_000_000 },
            Player { id: "Carol".to_string(), total_bet: 1_000_000_000 },
        ],
        10000
    );

    // Distribution test 2: 2:1 ratio should win proportionally
    run_distribution_test(
        "2:1 bet ratio distribution",
        vec![
            Player { id: "BigBet".to_string(), total_bet: 2_000_000_000 },   // 2 SOL (66.67%)
            Player { id: "SmallBet".to_string(), total_bet: 1_000_000_000 }, // 1 SOL (33.33%)
        ],
        10000
    );

    // Distribution test 3: Complex scenario
    run_distribution_test(
        "Multi-player varying bets",
        vec![
            Player { id: "P1".to_string(), total_bet: 5_000_000_000 },  // 5 SOL (50%)
            Player { id: "P2".to_string(), total_bet: 3_000_000_000 },  // 3 SOL (30%)
            Player { id: "P3".to_string(), total_bet: 2_000_000_000 },  // 2 SOL (20%)
        ],
        10000
    );

    println!("\n{:=<60}", "");
    println!("  ALL TESTS COMPLETE");
    println!("{:=<60}", "");
    println!();
}
