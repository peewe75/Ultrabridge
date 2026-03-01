/**
 * Validates a license key and links it to a Telegram Chat ID.
 * @param db Firestore instance
 * @param licenseKey The license key to validate
 * @param telegramChatId The Telegram Chat ID to link
 * @returns Object indicating success or failure with message and license data
 */
export async function validateAndLinkLicenseLogic(
    db: any,
    licenseKey: string,
    telegramChatId: string
) {
    const licensesRef = db.collection('licenses');

    // Search in global licenses
    let licenseSnapshot = await licensesRef.where('licenseKey', '==', licenseKey).limit(1).get();
    if (licenseSnapshot.empty) {
        licenseSnapshot = await licensesRef.where('license_key', '==', licenseKey).limit(1).get();
    }

    if (licenseSnapshot.empty) {
        return { success: false, message: '❌ License Key non trovata nel database.' };
    }

    const licenseDoc = licenseSnapshot.docs[0];
    const licenseData = licenseDoc.data();

    if (licenseData.status !== 'ACTIVE') {
        return { success: false, message: `❌ Questa licenza non è attiva (Stato: ${licenseData.status}).` };
    }

    const userId = licenseData.userId;
    if (!userId) {
        return { success: false, message: '❌ Errore interno: licenza non associata a un utente.' };
    }

    const usersRef = db.collection('users');
    const userSnapshot = await usersRef.doc(userId).get();

    if (!userSnapshot.exists) {
        return { success: false, message: '❌ Utente associato alla licenza non trovato.' };
    }

    // Update user with Telegram info
    await usersRef.doc(userId).update({
        telegramChatId: telegramChatId,
        telegram_id: Number(telegramChatId),
        linkedAt: new Date(),
    });

    return {
        success: true,
        userId,
        plan: licenseData.plan || 'BASIC',
        message: '✅ Account Sincronizzato!'
    };
}
