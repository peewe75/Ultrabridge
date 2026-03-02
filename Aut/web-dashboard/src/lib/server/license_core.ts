import crypto from 'crypto';

const _PARTS = ["S0f", "t1B", "r1d", "g3", "_Key", "_Master", "_2026"];
const SECRET = _PARTS.join('');

function _b64url_encode(buffer: Buffer): string {
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function _b64url_decode(str: string): Buffer {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
        str += '=';
    }
    return Buffer.from(str, 'base64');
}

function _sign(payload_b64: string): string {
    const hmac = crypto.createHmac('sha256', SECRET);
    hmac.update(payload_b64, 'ascii');
    const sig = hmac.digest();
    return _b64url_encode(sig);
}

export interface LicensePayload {
    v: number;
    product: string;
    telegram_id: number;
    plan: string;
    groups_limit: number;
    accounts_limit: number;
    allowed_accounts: string[];
    iat: number;
    exp: number;
}

export function makeKey(payload: LicensePayload): string {
    // Replica esatta del json.dumps python con separators=(",", ":") e sort_keys=True
    // JSON.stringify in JS rispetta l'ordine delle chiavi se glielo forniamo ordinato.
    const sortedPayload: any = {};
    Object.keys(payload).sort().forEach(key => {
        sortedPayload[key] = (payload as any)[key];
    });
    
    // In JS, JSON.stringify default equivale a separators=(",", ":")
    const jsonStr = JSON.stringify(sortedPayload);
    const payloadBuffer = Buffer.from(jsonStr, 'utf-8');
    
    const pb64 = _b64url_encode(payloadBuffer);
    const sb64 = _sign(pb64);
    
    return `${pb64}.${sb64}`;
}

export function verifyKey(key: string): boolean {
    const parts = key.split('.');
    if (parts.length !== 2) return false;
    
    const pb64 = parts[0];
    const sb64 = parts[1];
    
    return _sign(pb64) === sb64;
}

export function decodePayload(key: string): LicensePayload {
    if (!verifyKey(key)) {
        throw new Error("invalid key signature");
    }
    const pb64 = key.split('.')[0];
    const payloadBuffer = _b64url_decode(pb64);
    return JSON.parse(payloadBuffer.toString('utf-8'));
}