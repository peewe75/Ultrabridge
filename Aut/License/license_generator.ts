import { makeKey, LicensePayload } from "./license_core";

/**
 * Generates a license key and saves it to Firestore (user subcollection and global collection).
 * @param db Firestore instance
 * @param userId Clerk User ID
 * @param telegramId Telegram User ID
 * @param plan License Plan (e.g., BASIC, PRO)
 * @param durationDays Duration in days (e.g., 14, 30)
 * @returns The generated license key
 */
export async function generateAndSaveLicense(
    db: any,
    userId: string,
    telegramId: string | number,
    plan: string = "BASIC",
    durationDays: number = 14
) {
    const nowTs = Math.floor(Date.now() / 1000);
    const expiryTs = nowTs + (durationDays * 86400);

    // Random part generator for legacy formatted keys: BCS-XXXX-XXXX
    const randomPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const licenseKey = `BCS-${randomPart()}-${randomPart()}-${randomPart()}`;

    const expiresDate = new Date(expiryTs * 1000);
    const createdAt = new Date();

    // 1. Save to user subcollection
    await db.collection("users").doc(userId).collection("licenses").add({
        license_key: licenseKey,
        plan: plan,
        status: "ACTIVE",
        expires_at: expiresDate.toISOString(),
        created_at: createdAt.toISOString(),
        is_free_trial: durationDays === 14
    });

    // 2. Save to global collection (for Telegram Bot)
    await db.collection("licenses").add({
        userId: userId,
        licenseKey: licenseKey,
        status: "ACTIVE",
        plan: plan,
        expiresAt: expiresDate,
        createdAt: createdAt
    });

    return licenseKey;
}
