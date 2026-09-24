import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

import cron from "node-cron";
import qrcodeTerminal from "qrcode-terminal";
import { initPersistentWhatsApp } from "../whatsapp";
import { getSavedOAuth2Client } from "../authStore";
import { runHeadlessSync } from "../headlessSync";

async function main() {
  console.log("==========================================");
  console.log("   WhatsApp Contact Sync - Cron Daemon    ");
  console.log("==========================================");

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error(
      "\n[Error] GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in server/.env or environment."
    );
    process.exit(1);
  }

  const gAuth = getSavedOAuth2Client();
  if (!gAuth) {
    console.error(
      "\n[Error] No saved Google OAuth credentials found. Please ensure .credentials/google_tokens.json exists."
    );
    process.exit(1);
  }

  console.log("[Daemon] Initializing persistent WhatsApp session...");
  let isWaReady = false;

  const whatsappClient = initPersistentWhatsApp({
    onQR: (qr) => {
      console.log("\n[WhatsApp] Please scan the QR code below using WhatsApp (Linked Devices):\n");
      qrcodeTerminal.generate(qr, { small: true });
    },
    onReady: () => {
      isWaReady = true;
      console.log("[Daemon] WhatsApp client ready.");

      const runOnStartup =
        process.env.SYNC_ON_STARTUP === "true" ||
        process.argv.includes("--sync-on-startup");
      if (runOnStartup) {
        console.log("[Daemon] Initial sync requested on startup...");
        triggerSync();
      }
    },
  });

  async function triggerSync() {
    if (!isWaReady) {
      console.warn("[Daemon] Skipping sync - WhatsApp client is not ready yet.");
      return;
    }

    try {
      const auth = getSavedOAuth2Client();
      if (!auth) {
        console.error("[Daemon] Skipping sync - Google OAuth credentials invalid.");
        return;
      }

      const overwrite = process.env.OVERWRITE_PHOTOS === "true";
      console.log(`[Daemon] Triggering scheduled sync (Overwrite photos: ${overwrite})...`);
      await runHeadlessSync(whatsappClient, auth, { overwritePhotos: overwrite });
    } catch (err) {
      console.error("[Daemon] Error during scheduled sync:", err);
    }
  }

  // Cron schedule expression: default to weekly on Sundays at midnight (0 0 * * 0)
  const cronSchedule = process.env.CRON_SCHEDULE || "0 0 * * 0";

  if (!cron.validate(cronSchedule)) {
    console.error(`[Daemon] Invalid cron expression: "${cronSchedule}"`);
    process.exit(1);
  }

  console.log(`[Daemon] Scheduling sync job with pattern: "${cronSchedule}" (Weekly default: Sunday 00:00 midnight)`);
  
  const task = cron.schedule(cronSchedule, () => {
    console.log(`\n[Daemon] Cron trigger fired at ${new Date().toISOString()}`);
    triggerSync();
  });

  console.log("[Daemon] Daemon is active and waiting for scheduled cron execution. Press Ctrl+C to stop.");

  const cleanup = async () => {
    console.log("\n[Daemon] Shutting down daemon...");
    task.stop();
    try {
      await whatsappClient.destroy();
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((err) => {
  console.error("[Daemon] Fatal error:", err);
  process.exit(1);
});
