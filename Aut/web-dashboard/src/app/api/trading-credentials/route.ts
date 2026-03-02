import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { firestore } from 'firebase-admin';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key!';

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

function encryptPassword(password: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + encrypted;
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { accountNumber, password, brokerServer, signalSource, riskPercentage, fixedLots } = body;

    const db = getFirebaseAdmin();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    let finalEncryptedPassword = '';

    if (!password) {
      if (userDoc.exists && userDoc.data()?.tradingAccount?.password) {
        finalEncryptedPassword = userDoc.data()?.tradingAccount.password;
      } else {
        return NextResponse.json(
          { error: 'Password is required for first-time setup' },
          { status: 400 }
        );
      }
    } else {
      finalEncryptedPassword = encryptPassword(password);
    }

    if (!accountNumber || !brokerServer || !signalSource) {
      return NextResponse.json(
        { error: 'Missing required fields: accountNumber, brokerServer, signalSource' },
        { status: 400 }
      );
    }

    if (!userDoc.exists) {
      await userRef.set({
        userId,
        email: user.emailAddresses[0]?.emailAddress,
        licenseStatus: 'ACTIVE', // Automatically grant ACTIVE status for testing
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
    }

    await userRef.update({
      tradingAccount: {
        accountNumber: String(accountNumber),
        password: finalEncryptedPassword,
        passwordEncrypted: true,
        brokerServer: String(brokerServer),
        riskPercentage: riskPercentage ? Number(riskPercentage) : null,
        fixedLots: fixedLots ? Number(fixedLots) : null,
      },
      allowed_signal_source: String(signalSource),
      tradingAccountUpdatedAt: firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: 'Trading credentials saved successfully',
    });
  } catch (error) {
    console.error('Error saving trading credentials:', error);
    return NextResponse.json(
      { error: 'Failed to save trading credentials' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getFirebaseAdmin();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ tradingAccount: null });
    }

    const userData = userDoc.data();
    const tradingAccount = userData?.tradingAccount || null;

    if (tradingAccount && tradingAccount.passwordEncrypted) {
      return NextResponse.json({
        tradingAccount: {
          accountNumber: tradingAccount.accountNumber,
          brokerServer: tradingAccount.brokerServer,
          passwordEncrypted: true,
          riskPercentage: tradingAccount.riskPercentage,
          fixedLots: tradingAccount.fixedLots,
        },
        allowed_signal_source: userData?.allowed_signal_source,
      });
    }

    return NextResponse.json({
      tradingAccount,
      allowed_signal_source: userData?.allowed_signal_source,
    });
  } catch (error) {
    console.error('Error fetching trading credentials:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trading credentials' },
      { status: 500 }
    );
  }
}
