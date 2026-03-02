import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { firestore } from 'firebase-admin';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

function getFirebaseAdmin() {
    if (getApps().length === 0) {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

        if (!projectId || !clientEmail || !privateKey) {
            throw new Error('Firebase admin credentials not configured');
        }

        initializeApp({
            credential: cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });
    }
    return firestore();
}

export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = getFirebaseAdmin();
        const userDoc = await db.collection('users').doc(userId).get();

        if (!userDoc.exists || !userDoc.data()?.tradingAccount) {
            return NextResponse.json({ status: 'NOT_CONFIGURED' });
        }

        // In a real app, we would check MetaApi connection status here.
        // For now, we simulate by checking if there's a recent trade_log or if it was recently updated.
        const userData = userDoc.data();

        // Check if there are any errors in the last trade attempt
        const tradeLogs = await db.collection('trade_logs')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();

        // 1. Find all log entries that involve this specific account
        const relevantLogs = tradeLogs.docs.filter(doc =>
            doc.data().results.some((r: any) => r.accountNumber === userData?.tradingAccount?.accountNumber)
        );

        let lastError = null;
        if (relevantLogs.length > 0) {
            // 2. The first one is the most recent
            const latestResult = relevantLogs[0].data().results.find((r: any) => r.accountNumber === userData?.tradingAccount?.accountNumber);
            if (latestResult && !latestResult.success) {
                lastError = latestResult.errorReason;
            }
        }

        return NextResponse.json({
            status: lastError ? 'ERROR' : 'CONNECTED',
            accountNumber: userData?.tradingAccount?.accountNumber,
            brokerServer: userData?.tradingAccount?.brokerServer,
            lastError: lastError || null,
            lastUpdated: userData?.tradingAccountUpdatedAt?.toDate() || null
        });

    } catch (error) {
        console.error('Error fetching trading status:', error);
        return NextResponse.json({ status: 'ERROR', error: 'Internal server error' }, { status: 500 });
    }
}
