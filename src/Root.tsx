import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import { GameStatePage } from "./pages/GameStatePage";
import { OneVOnePage } from "./pages/OneVOnePage";
import { ReferralPage } from "./pages/ReferralPage";
import { FlappyPage } from "./pages/FlappyPage";
import { DebugCharPage } from "./pages/DebugCharPage";
import { LicensePage } from "./pages/LicensePage";
import { CopyrightPage } from "./pages/CopyrightPage";
import { PrivacyPage } from "./pages/PrivacyPage";

/**
 * Read Telegram Mini App startapp parameter.
 * Links like t.me/botname/app?startapp=1v1 set this param.
 */
function getTelegramStartRoute(): string | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const startParam = tg?.initDataUnsafe?.start_param;
    if (startParam) {
      // Map startapp params to routes
      const routes: Record<string, string> = {
        "1v1": "/1v1",
        "arena": "/",
        "referrals": "/referrals",
      };
      return routes[startParam] || null;
    }
  } catch {}
  return null;
}

const telegramRoute = getTelegramStartRoute();

export function Root() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={telegramRoute ? <Navigate to={telegramRoute} replace /> : <App />} />
        <Route path="/gamestate" element={<GameStatePage />} />
        <Route path="/1v1" element={<OneVOnePage />} />
        <Route path="/bloody" element={<FlappyPage />} />
        <Route path="/referrals" element={<ReferralPage />} />
        <Route path="/debugchar" element={<DebugCharPage />} />
        <Route path="/license" element={<LicensePage />} />
        <Route path="/copyright" element={<CopyrightPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Routes>
    </BrowserRouter>
  );
}
