import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

import qrcodeTerminal from "qrcode-terminal";
import { initPersistentWhatsApp } from "../whatsapp";
import { getSavedOAuth2Client } from "../authStore";
import { runHeadlessSync } from "../headlessSync";

async function main() {
  console.log("==========================================");
  console.log("   WhatsApp Contact Sync - Instant Runner ");
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

  console.log("[Sync] Initializing WhatsApp session...");

  const whatsappClient = initPersistentWhatsApp({
    onQR: (qr) => {
      console.log("\n[WhatsApp] Please scan the QR code below using WhatsApp (Linked Devices):\n");
      qrcodeTerminal.generate(qr, { small: true });
    },
    onReady: async () => {
      console.log("[Sync] WhatsApp client is ready.");
      try {
        const overwrite =
          process.argv.includes("--overwrite") ||
          process.argv.includes("-o") ||
          process.env.npm_config_overwrite === "true" ||
          process.env.OVERWRITE_PHOTOS === "true";
        await runHeadlessSync(whatsappClient, gAuth, { overwritePhotos: overwrite });
      } catch (err) {
        console.error("[Sync] Synchronization failed:", err);
      } finally {
        try {
          await whatsappClient.destroy();
        } catch {}
        process.exit(0);
      }
    },
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
