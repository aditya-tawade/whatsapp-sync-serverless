import fs from "fs";
import path from "path";
import { google, Auth } from "googleapis";

const CREDENTIALS_DIR = path.resolve(__dirname, "../.credentials");
const TOKENS_FILE = path.join(CREDENTIALS_DIR, "google_tokens.json");

export function saveGoogleTokens(tokens: Auth.Credentials): void {
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  }

  let existingTokens: Auth.Credentials = {};
  if (fs.existsSync(TOKENS_FILE)) {
    try {
      existingTokens = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8"));
    } catch {
      existingTokens = {};
    }
  }

  const updatedTokens = { ...existingTokens, ...tokens };
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(updatedTokens, null, 2), "utf-8");
  console.log(`[Google Auth] Tokens successfully saved to ${TOKENS_FILE}`);
}

export function getSavedGoogleTokens(): Auth.Credentials | null {
  if (fs.existsSync(TOKENS_FILE)) {
    try {
      const data = fs.readFileSync(TOKENS_FILE, "utf-8");
      return JSON.parse(data);
    } catch (e) {
      console.error(`[Google Auth] Failed to read tokens file:`, e);
    }
  }

  if (process.env.GOOGLE_TOKENS_JSON) {
    try {
      return JSON.parse(process.env.GOOGLE_TOKENS_JSON);
    } catch (e) {
      console.error(`[Google Auth] Failed to parse GOOGLE_TOKENS_JSON env var:`, e);
    }
  }

  if (process.env.GOOGLE_REFRESH_TOKEN) {
    return {
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    };
  }

  return null;
}

export function hasSavedGoogleTokens(): boolean {
  const tokens = getSavedGoogleTokens();
  return Boolean(tokens && (tokens.access_token || tokens.refresh_token));
}

export function getSavedOAuth2Client(): Auth.OAuth2Client | null {
  const tokens = getSavedGoogleTokens();
  if (!tokens) return null;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials(tokens);

  // Automatically persist updated tokens whenever they refresh
  oauth2Client.on("tokens", (newTokens) => {
    saveGoogleTokens(newTokens);
  });

  return oauth2Client;
}
