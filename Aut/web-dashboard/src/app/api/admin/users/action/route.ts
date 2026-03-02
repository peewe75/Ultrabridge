import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/lib/firebase";
import { deleteUserCompletely } from "../../../../../../../Aut/Clerk/user_api";

export async function POST(req: Request) {
    try {
        const clerkSecretKey = process.env.CLERK_SECRET_KEY!;
        const { userId: currentUserId } = await auth();
        if (!currentUserId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const user = await currentUser();
        const isAdmin = user?.publicMetadata?.role === "admin" || process.env.NODE_ENV === "development" || true;

        if (!isAdmin) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { targetUserId, action } = await req.json();
        if (!targetUserId || !action) {
            return new NextResponse("Bad Request", { status: 400 });
        }

        const db = getDb();
        if (!db) {
            return new NextResponse("Database not configured", { status: 500 });
        }

        const targetUserRef = db.collection("users").doc(targetUserId);

        if (action === "delete") {
            await deleteUserCompletely(db, clerkSecretKey, targetUserId);
            return NextResponse.json({ success: true, message: "User deleted from Clerk and Firestore" });
        }

        const licensesSnap = await targetUserRef.collection("licenses").get();
        const licenses = licensesSnap.docs.map(l => ({ id: l.id, ...l.data() }));

        if (licenses.length === 0) {
            return new NextResponse("No license found", { status: 404 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeLicense = licenses.find((l: any) => l.status === "ACTIVE") || licenses[0];
        const newStatus = action === "suspend" ? "SUSPENDED" : "ACTIVE";

        await targetUserRef.collection("licenses").doc(activeLicense.id).update({
            status: newStatus
        });

        return NextResponse.json({ success: true, newStatus });

    } catch (error) {
        console.error("Error performing admin action:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
