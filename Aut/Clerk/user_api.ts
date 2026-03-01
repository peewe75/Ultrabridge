import { createClerkClient } from "@clerk/nextjs/server";

export async function getAdminUsers(db: any, clerkSecretKey: string) {
    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    const usersSnap = await db.collection("users").get();
    const result = [];

    const clerkUsers = await clerk.users.getUserList({ limit: 100 });

    for (const doc of usersSnap.docs) {
        const uData = doc.data();
        const clerkUser = clerkUsers.data.find(u => u.id === doc.id);

        const licensesSnap = await db.collection("users").doc(doc.id).collection("licenses").get();
        const licenses = licensesSnap.docs.map(l => ({ id: l.id, ...l.data() }));

        let activeLicense: any = null;
        if (licenses.length > 0) {
            activeLicense = licenses.find((l: any) => l.status === "ACTIVE") || licenses[0];
        }

        result.push({
            id: doc.id,
            email: clerkUser?.emailAddresses[0]?.emailAddress || "N/A",
            firstName: clerkUser?.firstName || "Client",
            lastName: clerkUser?.lastName || doc.id.substring(0, 5),
            telegramId: uData.telegram_id || "-",
            updatedAt: uData.updated_at,
            plan: activeLicense?.plan || "BASIC",
            status: activeLicense?.status || "INACTIVE",
            licenseKey: activeLicense?.license_key || activeLicense?.licenseKey,
            expiresAt: activeLicense?.expires_at || activeLicense?.expiresAt,
            vps: activeLicense?.install_id || "Non sincronizzato"
        });
    }
    return result;
}

export async function deleteUserCompletely(db: any, clerkSecretKey: string, targetUserId: string) {
    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    const targetUserRef = db.collection("users").doc(targetUserId);

    // 1. Delete from Clerk
    try {
        await clerk.users.deleteUser(targetUserId);
    } catch (err) {
        console.error("Clerk delete error:", err);
    }

    // 2. Delete global licenses
    const globalLicensesSnap = await db.collection("licenses").where("userId", "==", targetUserId).get();
    if (!globalLicensesSnap.empty) {
        const batch = db.batch();
        globalLicensesSnap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }

    // 3. Delete subcollection licenses
    const licensesDocs = await targetUserRef.collection("licenses").get();
    if (!licensesDocs.empty) {
        const batch = db.batch();
        licensesDocs.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }

    // 4. Delete user doc
    await targetUserRef.delete();
}
