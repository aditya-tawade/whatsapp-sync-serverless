import { Auth } from "googleapis";
import { RateLimiter } from "limiter";
import { Client } from "whatsapp-web.js";

import { listContacts, updateContactPhoto } from "./gapi";
import { downloadFile, loadContacts } from "./whatsapp";
import { SimpleContact } from "./interfaces";
import { inferRegion, matchCandidates } from "./phone";

export interface HeadlessSyncOptions {
  overwritePhotos?: boolean;
}

export async function runHeadlessSync(
  whatsappClient: Client,
  gAuth: Auth.OAuth2Client,
  options: HeadlessSyncOptions = { overwritePhotos: false }
): Promise<{ total: number; synced: number; skipped: number; errors: number }> {
  console.log("[Sync] Starting contact picture synchronization...");

  const limiter = new RateLimiter({ tokensPerInterval: 1, interval: 1500 });

  let googleContacts: SimpleContact[];
  let whatsappContacts: Map<string, string>;

  try {
    googleContacts = await listContacts(gAuth);
    whatsappContacts = await loadContacts(whatsappClient);
    console.log(
      `[Sync] Loaded ${googleContacts.length} Google contacts and ${whatsappContacts.size} WhatsApp contacts.`
    );
  } catch (e) {
    console.error("[Sync] Error loading contacts:", e);
    throw e;
  }

  let syncCount = 0;
  let skippedAlreadyHasPhoto = 0;
  let skippedNotInWhatsApp = 0;
  let skippedNoWhatsAppPhoto = 0;
  let errorCount = 0;

  if (options.overwritePhotos) {
    console.log("[Sync] Mode: Overwrite existing photos enabled.");
  } else {
    console.log(
      "[Sync] Mode: Skip contacts with existing photos. (Use --overwrite or 'npm run sync-overwrite' to update all contacts)."
    );
  }

  const region = inferRegion(whatsappClient.info?.wid?.user);

  for (const [index, googleContact] of googleContacts.entries()) {
    if (!options.overwritePhotos && googleContact.hasPhoto) {
      skippedAlreadyHasPhoto++;
      continue;
    }

    try {
      let updated = false;
      let foundInWhatsApp = false;

      for (const phoneNumber of googleContact.numbers) {
        let whatsappContactId: string | undefined;

        for (const candidate of matchCandidates(phoneNumber, region)) {
          whatsappContactId = whatsappContacts.get(candidate);
          if (whatsappContactId) break;
        }

        if (!whatsappContactId) continue;
        foundInWhatsApp = true;

        const photo = await downloadFile(whatsappClient, whatsappContactId);
        if (!photo) break;

        await limiter.removeTokens(1);
        await updateContactPhoto(gAuth, googleContact.id, photo);
        syncCount++;
        updated = true;
        console.log(
          `[Sync] Updated photo for: ${googleContact.name || googleContact.id} (${syncCount})`
        );
        break;
      }

      if (!updated) {
        if (!foundInWhatsApp) {
          skippedNotInWhatsApp++;
        } else {
          skippedNoWhatsAppPhoto++;
        }
      }
    } catch (e) {
      errorCount++;
      console.error(
        `[Sync] Error processing contact ${googleContact.name || googleContact.id}:`,
        e
      );
    }

    if ((index + 1) % 10 === 0 || index === googleContacts.length - 1) {
      const progress = Math.round(((index + 1) / googleContacts.length) * 100);
      console.log(
        `[Sync] Progress: ${progress}% (${index + 1}/${googleContacts.length}) - Updated: ${syncCount}`
      );
    }
  }

  const totalSkipped = skippedAlreadyHasPhoto + skippedNotInWhatsApp + skippedNoWhatsAppPhoto;

  console.log(
    `[Sync] Synchronization complete! Total: ${googleContacts.length}, Updated: ${syncCount}, Skipped: ${totalSkipped}, Errors: ${errorCount}`
  );

  if (totalSkipped > 0) {
    console.log(`[Sync] Skipped contacts breakdown:`);
    if (skippedAlreadyHasPhoto > 0) {
      console.log(
        `  - Already had a Google contact photo: ${skippedAlreadyHasPhoto} (use 'npm run sync-overwrite' to update these)`
      );
    }
    if (skippedNotInWhatsApp > 0) {
      console.log(
        `  - Not found in WhatsApp: ${skippedNotInWhatsApp}`
      );
    }
    if (skippedNoWhatsAppPhoto > 0) {
      console.log(
        `  - No WhatsApp profile picture available: ${skippedNoWhatsAppPhoto}`
      );
    }
  }

  return {
    total: googleContacts.length,
    synced: syncCount,
    skipped: totalSkipped,
    errors: errorCount,
  };
}
