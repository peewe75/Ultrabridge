import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { getDb } from "@/lib/firebase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
    apiVersion: "2026-01-28.clover"
});

// Map your internal plans to the actual Stripe Price IDs
// You must update these with your real Price IDs from the Stripe Dashboard
const PLAN_TO_PRICE_ID: Record<string, string> = {
    "BASIC": process.env.STRIPE_PRICE_BASIC || "price_basic_mock",
    "PRO": process.env.STRIPE_PRICE_PRO || "price_pro_mock",
    "ENTERPRISE": process.env.STRIPE_PRICE_ENTERPRISE || "price_enterprise_mock"
};

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const user = await currentUser();
        if (!user) {
            return new NextResponse("User data not found", { status: 401 });
        }

        const { plan } = await req.json();
        const priceId = PLAN_TO_PRICE_ID[plan];

        if (!priceId) {
            return new NextResponse("Invalid Plan Selected", { status: 400 });
        }

        const db = getDb();
        if (!db) {
            return new NextResponse("Database not configured", { status: 500 });
        }

        // Try to find if user already has a Stripe Customer ID
        const userDoc = await db.collection("users").doc(userId).get();
        let stripeCustomerId = userDoc.data()?.stripe_customer_id;

        if (!stripeCustomerId) {
            // Create a new customer in Stripe if they don't exist yet
            const email = user.emailAddresses[0]?.emailAddress;

            const customer = await stripe.customers.create({
                email: email,
                metadata: {
                    clerkId: userId
                }
            });
            stripeCustomerId = customer.id;

            // Save it to Firebase for future use
            await db.collection("users").doc(userId).update({
                stripe_customer_id: stripeCustomerId
            });
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ultrabot.space";

        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            payment_method_types: ["card"],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: "subscription",
            success_url: `${appUrl}/dashboard?success=true`,
            cancel_url: `${appUrl}/dashboard?canceled=true`,
            metadata: {
                userId: userId, // CRITICAL: This allows the Webhook to know who paid
                plan: plan
            }
        });

        return NextResponse.json({ url: session.url });

    } catch (error) {
        console.error("Error creating stripe checkout session:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
