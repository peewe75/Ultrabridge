import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/firebase";
import { generateAndSaveLicense } from "../../../../../Aut/License/license_generator";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { telegramId } = await req.json();

    if (!telegramId || isNaN(Number(telegramId))) {
      return new NextResponse("Invalid Telegram ID", { status: 400 });
    }

    // Salva in Firestore
    const db = getDb();
    if (!db) {
      return new NextResponse("Database not configured", { status: 500 });
    }

    await db.collection("users").doc(userId).set({
      telegram_id: Number(telegramId),
      updated_at: new Date().toISOString()
    }, { merge: true });

    // --- Generazione Piano Gratuito (BCS- format) ---
    const planName = "BASIC";
    const licenseKey = await generateAndSaveLicense(db, userId, telegramId, planName, 14);

    console.log(`✅ Licenza Gratuita (BASIC) creata per ${userId} (Telegram: ${telegramId}): ${licenseKey}`);

    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    if (telegramBotToken) {
      const msg = `✅ <b>Benvenuto in BCS AI!</b>\n\n<b>Piano:</b> ${planName} (Prova Gratuita 14 Giorni)\n\n<b>La tua License Key:</b>\n<code>${licenseKey}</code>\n\nCopia e incolla questa chiave qui sotto oppure usa il comando /sync seguita dalla chiave per iniziare!`;
      try {
        const botRes = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramId,
            text: msg,
            parse_mode: 'HTML'
          })
        });

        if (!botRes.ok) {
          const errData = await botRes.json();
          console.error("Telegram API Error:", errData);
        }
      } catch (e) { console.error("Errore invio Telegram", e); }
    }
    // ---------------------------------------

    return NextResponse.json({ success: true, licenseKey });
  } catch (error) {
    console.error("Error saving Telegram ID & mocking license:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
