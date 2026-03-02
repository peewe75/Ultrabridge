import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/firebase";

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const db = getDb();
        if (!db) {
            return new NextResponse("Database not configured", { status: 500 });
        }

        // Fetch user doc for telegram_id
        const userDocRef = db.collection("users").doc(userId);
        const userDocSnap = await userDocRef.get();

        let hasTelegramId = false;
        let telegramId = null;

        if (userDocSnap.exists) {
            const data = userDocSnap.data();
            if (data && data.telegram_id) {
                hasTelegramId = true;
                telegramId = data.telegram_id;
            }
        }

        // Fetch active licenses
        const licensesRef = userDocRef.collection("licenses");
        const licensesSnap = await licensesRef
            .where("status", "==", "ACTIVE")
            .get();

        let activeLicense = null;
        if (!licensesSnap.empty) {
            // Sort by created_at desc in memory to avoid needing a Firestore composite index
            const licenses = licensesSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as any)).sort((a, b) => {
                const dateA = new Date(a.created_at || 0).getTime();
                const dateB = new Date(b.created_at || 0).getTime();
                return dateB - dateA;
            });

            activeLicense = licenses[0];
        }

        return NextResponse.json({
            success: true,
            hasTelegramId,
            telegramId,
            activeLicense
        });

    } catch (error) {
        console.error("Error fetching user data:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
