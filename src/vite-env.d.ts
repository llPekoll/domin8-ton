/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  // Convex
  readonly VITE_CONVEX_URL: string;

  // Privy
  readonly VITE_PRIVY_APP_ID: string;

  // TON
  readonly VITE_TON_NETWORK: string;
  readonly VITE_TON_MASTER_ADDRESS: string;

  // Logger Configuration
  readonly VITE_LOGGER_ENABLED?: string;
  readonly VITE_LOG_LEVEL?: string;
  readonly VITE_LOG_CATEGORIES?: string;
  readonly VITE_LOG_TIMESTAMP?: string;
  readonly VITE_LOG_STACK_TRACE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
