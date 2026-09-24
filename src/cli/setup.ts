import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import express from "express";
import open from "open";
import qrcodeTerminal from "qrcode-terminal";
import { initPersistentWhatsApp } from "../whatsapp";
import { generateGoogleAuthUrl, getOAuth2ClientFromCode } from "../gapi";
import { saveGoogleTokens, hasSavedGoogleTokens } from "../authStore";

async function runSetup() {
  console.log("==========================================");
  console.log("   WhatsApp Contact Sync - CLI Setup Tool ");
  console.log("==========================================");

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error(
      "\n[Error] GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in server/.env or environment."
    );
    console.error(
      "Please create a server/.env file with your Google OAuth credentials."
    );
    process.exit(1);
  }

  console.log("\n[Step 1] Initializing WhatsApp Persistent Session...");
  
  let waReady = false;
  const whatsappClient = initPersistentWhatsApp({
    onQR: (qr: string) => {
      console.log("\n[WhatsApp] Please scan the QR code below using WhatsApp (Linked Devices):\n");
      qrcodeTerminal.generate(qr, { small: true });
    },
    onReady: async () => {
      waReady = true;
      console.log("[WhatsApp] WhatsApp authentication successful!");
      await proceedGoogleAuth();
    },
  });

  async function proceedGoogleAuth() {
    console.log("\n[Step 2] Checking Google OAuth authorization...");
    if (hasSavedGoogleTokens()) {
      console.log("[Google Auth] Existing saved Google credentials found!");
      finishSetup();
      return;
    }

    console.log("[Google Auth] No saved Google credentials found. Starting authentication server...");
    const app = express();
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
    const redirectUri = `http://localhost:${port}/api/google_callback`;

    const state = "cli_setup_state";
    const authUrl = generateGoogleAuthUrl(redirectUri, state);

    const server = app.listen(port, async () => {
      console.log(`\n===============================================================`);
      console.log(`Open the following URL in your browser to authorize Google Contacts:`);
      console.log(authUrl);
      console.log(`===============================================================\n`);

      try {
        await open(authUrl);
      } catch {
        // Ignore if auto-open is unsupported in the current shell
      }
    });

    app.get("/api/google_callback", async (req, res) => {
      const code = req.query.code as string;
      if (!code) {
        res.status(400).send("Authorization failed: Missing authorization code.");
        return;
      }

      try {
        const oauth2Client = await getOAuth2ClientFromCode(code, redirectUri);
        saveGoogleTokens(oauth2Client.credentials);

        res.send(
          "<h2>Google Contacts Authorization Successful!</h2><p>You can close this tab and return to your terminal.</p>"
        );

        server.close(() => {
          console.log("\n[Google Auth] Authentication server closed.");
          finishSetup();
        });
      } catch (err: any) {
        console.error("[Google Auth] Failed to exchange authorization code:", err?.message || err);
        res.status(500).send("Failed to complete Google token exchange.");
      }
    });
  }

  async function finishSetup() {
    console.log("\n==========================================================");
    console.log("   SETUP COMPLETED SUCCESSFULLY!");
    console.log("   - WhatsApp session saved to: ./.wwebjs_auth");
    console.log("   - Google credentials saved to: .credentials/google_tokens.json");
    console.log("");
    console.log("   You can now run:");
    console.log("   - `npm run daemon`   : Start weekly automated background sync");
    console.log("   - `npm run sync-now` : Run an immediate sync");
    console.log("==========================================================\n");

    try {
      await whatsappClient.destroy();
    } catch {}
    process.exit(0);
  }
}

runSetup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
