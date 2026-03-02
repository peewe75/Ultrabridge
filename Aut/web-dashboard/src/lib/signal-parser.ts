export interface ParsedSignal {
    side: 'BUY' | 'SELL' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
    symbol: string;
    entryPrice: number | null;
    stopLoss: number | null;
    takeProfits: number[];
    isValid: boolean;
}

const SYMBOL_PATTERNS = [
    /\b(XAUUSD|XAUUSD\.?|GOLD|XTIUSD|WTI|Brent|BCO)\b/i,
    /\b(EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|USDCAD|NZDUSD)\b/i,
    /\b(EURJPY|GBPJPY|AUDJPY|NZDJPY|CADJPY|CHFJPY)\b/i,
    /\b(EURGBP|EURCHF|AUDNZD|CADCHF|AUDCAD|GBPAUD|GBPCAD)\b/i,
    /\b(US30|US500|US100|NAS100|NASDAQ|DOW|JPN225|NIKKEI|GER40|UK100|FRA40|EU50)\b/i,
    /\b([A-Z]{2,6}\d{3,6}|[A-Z]{3,6})\b/i,
];

const ENTRY_PATTERNS = [
    /entry[:\s]*[@\s]*([\d.]+)/i,
    /price[:\s]*[@\s]*([\d.]+)/i,
    /(@\s*)?([\d.]+)/,
    /(?:entrance|enter|entry\s*price)[:\s]*([\d.]+)/i,
];

const SL_PATTERNS = [
    /sl[:\s]*([\d.]+)/i,
    /(?:stop\s*loss|stoploss)[:\s]*([\d.]+)/i,
];

function extractSide(text: string): ParsedSignal['side'] | null {
    const normalized = text.toUpperCase();
    if (normalized.includes('BUY LIMIT')) return 'BUY_LIMIT';
    if (normalized.includes('SELL LIMIT')) return 'SELL_LIMIT';
    if (normalized.includes('BUY STOP')) return 'BUY_STOP';
    if (normalized.includes('SELL STOP')) return 'SELL_STOP';
    if (normalized.includes('BUY')) return 'BUY';
    if (normalized.includes('SELL')) return 'SELL';
    return null;
}

function extractSymbol(text: string): string | null {
    for (const pattern of SYMBOL_PATTERNS) {
        const match = text.match(pattern);
        if (match) return match[0].toUpperCase().replace(/\./g, '');
    }
    return null;
}

function extractPrice(text: string, patterns: RegExp[]): number | null {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const price = parseFloat(match[1] || match[2]);
            if (!isNaN(price) && price > 0) return price;
        }
    }
    return null;
}

function extractTakeProfits(text: string): number[] {
    const tps: number[] = [];
    const tp1Match = text.match(/tp1[:\s]+([\d.]+)/i);
    if (tp1Match) {
        const val = parseFloat(tp1Match[1]);
        if (!isNaN(val) && val > 10) tps.push(val);
    }
    const tp2Match = text.match(/tp2[:\s]+([\d.]+)/i);
    if (tp2Match) {
        const val = parseFloat(tp2Match[1]);
        if (!isNaN(val) && val > 10) tps.push(val);
    }
    const tp3Match = text.match(/tp3[:\s]+([\d.]+)/i);
    if (tp3Match) {
        const val = parseFloat(tp3Match[1]);
        if (!isNaN(val) && val > 10) tps.push(val);
    }
    const genericTpMatches = text.matchAll(/(?:take\s*profit|tp)(?![123])[:\s]+([\d.]+)/gi);
    for (const match of Array.from(genericTpMatches)) {
        const tp = parseFloat(match[1]);
        if (!isNaN(tp) && tp > 10 && !tps.includes(tp)) tps.push(tp);
    }
    return tps.sort((a, b) => a - b);
}

export function testParseSignal(text: string): ParsedSignal | null {
    if (!text || text.trim().length < 3) return null;

    const side = extractSide(text);
    const symbol = extractSymbol(text);

    if (!side || !symbol) return null;

    const atMatch = text.match(/@\s*([\d.]+)/);
    const entryPrice = atMatch ? parseFloat(atMatch[1]) : extractPrice(text, ENTRY_PATTERNS);
    const stopLoss = extractPrice(text, SL_PATTERNS);
    const takeProfits = extractTakeProfits(text);

    return {
        side,
        symbol,
        entryPrice,
        stopLoss,
        takeProfits,
        isValid: !!(entryPrice || stopLoss || takeProfits.length > 0)
    };
}
