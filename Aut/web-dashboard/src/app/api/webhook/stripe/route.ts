import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getDb } from "@/lib/firebase";
import { generateAndSaveLicense } from "../../../../../../Aut/License/license_generator";

// Inizializza Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
  apiVersion: "2026-01-28.clover"
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Mappa temporanea dei piani (dovrai allinearla con gli ID dei prodotti Stripe)
const STRIPE_PRODUCT_TO_PLAN: Record<string, { name: string, g_lim: number, a_lim: number }> = {
  "prod_BASIC123": { name: "BASIC", g_lim: 1, a_lim: 1 },
  "prod_PRO456": { name: "PRO", g_lim: 3, a_lim: 3 },
  "prod_ENTERPRISE789": { name: "ENTERPRISE", g_lim: 10, a_lim: 10 }
};

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature || !webhookSecret) {
      return new NextResponse("Missing signature or secret", { status: 400 });
    }

    // Verifica firma Stripe
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown Error';
      return new NextResponse(`Webhook Error: ${errorMessage}`, { status: 400 });
    }

    const db = getDb();
    if (!db) {
      return new NextResponse("Database non configurato", { status: 500 });
    }

    // Ascolta il pagamento dell'abbonamento completato
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // Quando crei il Checkout su Stripe dal frontend, DEVI passare il userId di Clerk nei metadata!
      const userId = session.metadata?.userId;

      if (!userId) {
        console.error("Nessun userId trovato nei metadata di Stripe");
        return new NextResponse("OK", { status: 200 }); // Rispondi OK a Stripe altrimenti riprova all'infinito
      }

      // Recupera il Telegram ID salvato dal db (Firebase)
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        console.error(`Utente ${userId} non trovato in DB`);
        return new NextResponse("OK", { status: 200 });
      }

      const telegramId = userDoc.data()?.telegram_id;
      if (!telegramId) {
        console.error(`Utente ${userId} non ha un Telegram ID salvato`);
        return new NextResponse("OK", { status: 200 });
      }

      // Ricava il piano acquistato dalle righe della sessione
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      const productId = lineItems.data[0]?.price?.product as string;

      // Default a BASIC se non trovato nel mapping
      const planConfig = STRIPE_PRODUCT_TO_PLAN[productId] || { name: "BASIC", g_lim: 1, a_lim: 1 };

      // Generate and save license using centralized logic
      const planName = planConfig.name;
      const licenseKey = await generateAndSaveLicense(db, userId, telegramId, planName, 30);

      console.log(`✅ Licenza creata per ${userId} (Telegram: ${telegramId}): ${licenseKey}`);

      // (OPZIONALE MA CONSIGLIATO) 
      // Qui potresti fare una fetch verso le API di Telegram (o il tuo bot) per inviare un messaggio al volo
      const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN; // Aggiungi in .env.local
      if (telegramBotToken) {
        const msg = `✅ <b>BCS AI Acquisto Web</b>\n\n<b>Piano:</b> ${planConfig.name}\n<b>La tua License Key:</b>\n<code>${licenseKey}</code>`;
        try {
          await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramId,
              text: msg,
              parse_mode: 'HTML'
            })
          });
        } catch (e) { console.error("Errore invio Telegram", e); }
      }
    }

    return new NextResponse("Webhook ricevuto", { status: 200 });
  } catch (error) {
    console.error("Webhook interno error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}