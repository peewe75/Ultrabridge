import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { getDb } from "@/lib/firebase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
    apiVersion: "2026-01-28.clover"
});

export async function POST() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const db = getDb();
        if (!db) {
            return new NextResponse("Database not configured", { status: 500 });
        }

        const userDoc = await db.collection("users").doc(userId).get();
        const stripeCustomerId = userDoc.data()?.stripe_customer_id;

        if (!stripeCustomerId) {
            return new NextResponse("Manca il profilo Customer su Stripe", { status: 400 });
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ultrabot.space";

        const session = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: `${appUrl}/dashboard`,
        });

        return NextResponse.json({ url: session.url });

    } catch (error) {
        console.error("Error creating stripe portal session:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
