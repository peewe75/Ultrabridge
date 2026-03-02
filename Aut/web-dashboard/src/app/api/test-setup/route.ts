import { NextResponse } from "next/server";
import { createClerkClient } from "@clerk/nextjs/server";
import { getDb } from "@/lib/firebase";
import { makeKey, LicensePayload } from "@/lib/server/license_core";

export async function GET(req: Request) {
    try {
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        if (process.env.NODE_ENV === "production" && req.headers.get("x-secret-setup") !== "BCS_ACTIVATE_2026") {
            return new NextResponse("Forbidden in Production", { status: 403 });
        }
        const db = getDb();
        if (!db) return new NextResponse("No DB", { status: 500 });

        let adminUser;
        const existingAdmin = await clerk.users.getUserList({ emailAddress: ["peewe75@gmail.com"] });
        if (existingAdmin.data.length > 0) {
            adminUser = existingAdmin.data[0];
        } else {
            adminUser = await clerk.users.createUser({
                emailAddress: ["peewe75@gmail.com"],
                password: "BCS_AI_Admin2026!",
                firstName: "Admin",
                lastName: "User",
                skipPasswordChecks: true
            });
        }

        if (adminUser) {
            await db.collection("users").doc(adminUser.id).set({
                telegram_id: 111111111,
                role: "admin",
                updated_at: new Date().toISOString()
            }, { merge: true });
        }

        // 2. Create CLIENT USER
        let clientUser;
        const existingClient = await clerk.users.getUserList({ emailAddress: ["client_test@bcs-ai.com"] });
        if (existingClient.data.length > 0) {
            clientUser = existingClient.data[0];
        } else {
            clientUser = await clerk.users.createUser({
                emailAddress: ["client_test@bcs-ai.com"],
                password: "TestBCS_AI_123!@",
                firstName: "Client",
                lastName: "User",
                skipPasswordChecks: true
            });
        }

        let clientLicenseKey = "";
        if (clientUser) {
            const clientTelegram = 999999999;
            await db.collection("users").doc(clientUser.id).set({
                telegram_id: clientTelegram,
                role: "client",
                updated_at: new Date().toISOString()
            }, { merge: true });

            // Generate PRO license
            const planName = "PRO";
            const nowTs = Math.floor(Date.now() / 1000);
            const expiryTs = nowTs + (30 * 86400);

            const payload: LicensePayload = {
                v: 2,
                product: "BCS_AI_BRIDGE",
                telegram_id: clientTelegram,
                plan: planName,
                groups_limit: 3,
                accounts_limit: 3,
                allowed_accounts: [],
                iat: nowTs,
                exp: expiryTs
            };

            clientLicenseKey = makeKey(payload);

            // Check if license already exists
            const existingLicenses = await db.collection("users").doc(clientUser.id).collection("licenses").get();
            if (existingLicenses.empty) {
                await db.collection("users").doc(clientUser.id).collection("licenses").add({
                    license_key: clientLicenseKey,
                    plan: planName,
                    status: "ACTIVE",
                    expires_at: new Date(expiryTs * 1000).toISOString(),
                    created_at: new Date().toISOString(),
                    stripe_subscription_id: "mock_sub_test"
                });
            }
        }

        return NextResponse.json({
            success: true,
            message: "Test users created successfully.",
            users: {
                admin: {
                    email: "peewe75@gmail.com",
                    password: "BCS_AI_Admin2026! (se non ha usato Google)",
                    telegram_id: 111111111,
                },
                client: {
                    email: "client_test@bcs-ai.com",
                    password: "TestBCS_AI_123!@",
                    telegram_id: 999999999,
                    pro_license: clientLicenseKey
                }
            }
        });

    } catch (error: any) {
        console.error("Test setup error", error);

        let errorDetails = error.message;
        if (error.errors) {
            errorDetails = error.errors;
            console.error("Clerk errors:", JSON.stringify(error.errors, null, 2));
        }

        return NextResponse.json({
            error: "Unprocessable Entity",
            details: errorDetails
        }, { status: 500 });
    }
}
