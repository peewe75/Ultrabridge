import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/lib/firebase";
import { getAdminUsers } from "../../../../../../Aut/Clerk/user_api";

export async function GET() {
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

        const db = getDb();
        if (!db) {
            return new NextResponse("Database not configured", { status: 500 });
        }

        const result = await getAdminUsers(db, clerkSecretKey);

        return NextResponse.json({ success: true, users: result });

        return NextResponse.json({ success: true, users: result });

    } catch (error) {
        console.error("Error fetching admin data:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
