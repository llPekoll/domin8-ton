const adjectives = [
  "Mighty", "Swift", "Shadow", "Crimson", "Azure", "Golden", "Silver", "Cosmic",
  "Phantom", "Royal", "Neon", "Storm", "Fire", "Ice", "Thunder", "Lightning",
  "Wild", "Brave", "Bold", "Fierce", "Epic", "Legendary", "Ultra", "Mega",
  "Dark", "Light", "Mystic", "Ancient", "Future", "Cyber", "Quantum", "Atomic"
];

const nouns = [
  "Warrior", "Knight", "Samurai", "Ninja", "Wizard", "Mage", "Hunter", "Ranger",
  "Champion", "Gladiator", "Titan", "Phoenix", "Dragon", "Wolf", "Tiger", "Lion",
  "Eagle", "Hawk", "Falcon", "Viper", "Cobra", "Panther", "Bear", "Shark",
  "Raider", "Striker", "Crusher", "Destroyer", "Guardian", "Defender", "Slayer", "Reaper"
];

export function generateRandomName(): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 9000) + 1000; // 4-digit number
  return `${adjective}${noun}${number}`;
}