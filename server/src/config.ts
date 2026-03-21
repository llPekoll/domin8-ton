export const config = {
  port: parseInt(process.env.PORT || "3002"),
  databaseUrl: process.env.DATABASE_URL || "postgresql://localhost:5432/domin8",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  nodeEnv: process.env.NODE_ENV || "development",

  // TON
  tonNetwork: process.env.TON_NETWORK || "testnet",
  tonMasterAddress: process.env.TON_MASTER_ADDRESS || "",
  tonMnemonic: process.env.TON_MNEMONIC || "",
  tonCenterApiKey: process.env.TONCENTER_API_KEY || "",

  // Presence bot
  presenceBotPrivateKey: process.env.PRESENCE_BOT_PRIVATE_KEY || "",
  presenceBotEnabled: process.env.PRESENCE_BOT_ENABLED !== "false",

  // Notifications
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",

  // Web Push VAPID keys
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:admin@domin8.fun",

  // Game timing constants (in milliseconds)
  cronInterval: 50_000, // 50 seconds
  sendPrizeDelay: 2_000, // 2 seconds
  createGameDelay: 18_000, // 18 seconds
};
