from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.models import SignalFormat


SIDE_ALIASES = {
    "BUY": "BUY",
    "LONG": "BUY",
    "COMPRA": "BUY",
    "ACQUISTO": "BUY",
    "SELL": "SELL",
    "SHORT": "SELL",
    "VENDI": "SELL",
    "VENTA": "SELL",
}

SYMBOL_ALIASES = {
    "GOLD": "XAUUSD",
    "XAU": "XAUUSD",
    "XAUUSD": "XAUUSD",
    "SILVER": "XAGUSD",
    "XAG": "XAGUSD",
    "XAGUSD": "XAGUSD",
}


@dataclass
class ParseOutcome:
    matched: bool
    parser_used: str | None = None
    confidence: int = 0
    mode: str | None = None
    canonical: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    validation: dict[str, Any] = field(default_factory=dict)
    normalized_text: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "matched": self.matched,
            "parser_used": self.parser_used,
            "confidence": self.confidence,
            "mode": self.mode,
            "canonical": self.canonical,
            "warnings": self.warnings,
            "errors": self.errors,
            "validation": self.validation,
            "normalized_text": self.normalized_text,
        }


def normalize_signal_text(text: str) -> str:
    s = (text or "").strip()
    s = s.replace("\u2013", "-").replace("\u2014", "-").replace("\u2212", "-")
    s = s.replace("🟢", " ").replace("🔴", " ").replace("✅", " ").replace("🔥", " ").replace("📈", " ").replace("📉", " ")
    s = s.replace(",", ".")
    s = re.sub(r"[\n\r]+", " ", s)
    s = re.sub(r"[ \t]+", " ", s)
    return s.upper().strip()


def _find_side(text: str) -> str | None:
    for raw, canon in SIDE_ALIASES.items():
        if re.search(rf"\b{re.escape(raw)}\b", text):
            return canon
    return None


def _normalize_symbol(raw: str | None) -> str | None:
    if not raw:
        return None
    raw = raw.upper()
    if raw in SYMBOL_ALIASES:
        return SYMBOL_ALIASES[raw]
    if re.fullmatch(r"[A-Z]{6,10}", raw):
        return raw
    return None


def _find_symbol(text: str) -> str | None:
    # prioritized aliases then generic FX-like
    for key, val in SYMBOL_ALIASES.items():
        if re.search(rf"\b{re.escape(key)}\b", text):
            return val
    m = re.search(r"\b([A-Z]{6,10})\b", text)
    if m:
        return _normalize_symbol(m.group(1))
    return None


def _to_float(v: Any) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(str(v).replace(",", "."))
    except Exception:
        return None


def _to_int(v: Any) -> int | None:
    try:
        if v is None or v == "":
            return None
        return int(float(str(v).replace(",", ".")))
    except Exception:
        return None


def _extract_tps_price(text: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for key in ["TP1", "TP2", "TP3", "TP4"]:
        m = re.search(rf"\b{key}\s*[: ]\s*(\d{{1,6}}(?:\.\d{{1,5}})?)", text)
        if m:
            out[key.lower() + "_price"] = float(m.group(1))
    # generic TP if TP1 absent
    if "tp1_price" not in out:
        m = re.search(r"\bTP\s*[: ]\s*(\d{1,6}(?:\.\d{1,5})?)", text)
        if m:
            out["tp1_price"] = float(m.group(1))
    return out


def _extract_tps_pips(text: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for key in ["TP1", "TP2", "TP3"]:
        m = re.search(rf"\b{key}\s*[: ]\s*(\d{{1,5}})\s*(?:PIP|PIPS)?\b", text)
        if m:
            out[key.lower() + "_pips"] = int(m.group(1))
    if "tp1_pips" not in out:
        m = re.search(r"\bTP\s*[: ]\s*(\d{1,5})\s*(?:PIP|PIPS)?\b", text)
        if m:
            out["tp1_pips"] = int(m.group(1))
    return out


def _validation_for_prices(side: str, entry_ref: float, sl: float | None, tp_values: list[float]) -> tuple[bool, list[str]]:
    errs: list[str] = []
    if sl is not None:
        if side == "BUY" and sl >= entry_ref:
            errs.append("BUY richiede SL < entry")
        if side == "SELL" and sl <= entry_ref:
            errs.append("SELL richiede SL > entry")
    for tp in tp_values:
        if side == "BUY" and tp <= entry_ref:
            errs.append("BUY richiede TP > entry")
            break
        if side == "SELL" and tp >= entry_ref:
            errs.append("SELL richiede TP < entry")
            break
    return (len(errs) == 0), errs


def _score_and_validate(out: ParseOutcome) -> ParseOutcome:
    c = out.canonical
    score = 0
    if c.get("side"):
        score += 25
    if c.get("symbol"):
        score += 20
    if c.get("mode"):
        score += 10

    warnings: list[str] = []
    validation = {"valid_logic": True, "checks": []}

    mode = c.get("mode")
    if mode == "PRICE":
        entry_lo = _to_float(c.get("entry_lo"))
        entry_hi = _to_float(c.get("entry_hi"))
        entry = _to_float(c.get("entry"))
        sl_price = _to_float(c.get("sl_price"))
        tps = [_to_float(c.get(k)) for k in ["tp1_price", "tp2_price", "tp3_price"]]
        tps = [x for x in tps if x is not None]
        if entry_lo is not None and entry_hi is not None:
            score += 20
            ref = (entry_lo + entry_hi) / 2.0
        elif entry is not None:
            score += 20
            ref = entry
        else:
            ref = None
        if sl_price is not None:
            score += 15
        if tps:
            score += 10
        if ref is not None and c.get("side"):
            ok, errs = _validation_for_prices(c["side"], ref, sl_price, tps)
            validation["valid_logic"] = ok
            validation["checks"] = errs
            if not ok:
                score -= 40
                out.errors.extend(errs)
    elif mode == "PIPS":
        if _to_float(c.get("entry")) is not None:
            score += 20
        if _to_int(c.get("sl_pips")) and _to_int(c.get("sl_pips")) > 0:
            score += 15
        if _to_int(c.get("tp1_pips")) and _to_int(c.get("tp1_pips")) > 0:
            score += 10
        # extra sanity
        if _to_int(c.get("sl_pips")) is not None and _to_int(c.get("sl_pips")) <= 0:
            out.errors.append("sl_pips deve essere > 0")
            score -= 30
            validation["valid_logic"] = False
    elif mode == "SHORTHAND":
        needed = ["entry1", "entry2", "sl", "tp1", "tp2"]
        present = sum(1 for k in needed if _to_int(c.get(k)) is not None)
        score += min(40, present * 8)
        if present < 4:
            validation["valid_logic"] = False
            out.errors.append("SHORTHAND incompleto")
            score -= 25
    else:
        warnings.append("mode non determinato")
        score -= 20

    out.confidence = max(0, min(100, score))
    out.validation = validation
    out.warnings.extend(warnings)
    return out


def _apply_template_formats(text: str, formats: list[SignalFormat]) -> ParseOutcome | None:
    for fmt in sorted([f for f in formats if f.enabled], key=lambda x: x.priority):
        if fmt.parser_kind != "REGEX_TEMPLATE" or not fmt.regex_pattern:
            continue
        try:
            m = re.search(fmt.regex_pattern, text, re.IGNORECASE | re.MULTILINE)
        except re.error:
            continue
        if not m:
            continue
        gd = {k: v for k, v in m.groupdict().items() if v is not None}
        canonical: dict[str, Any] = {}
        # direct named groups supported
        for key in [
            "symbol","side","entry","sl_pips","tp1_pips","tp2_pips","tp3_pips",
            "entry_lo","entry_hi","sl_price","tp1_price","tp2_price","tp3_price","tp4_price","tp_open",
            "entry1","entry2","sl","tp1","tp2","tp3","open",
        ]:
            if key in gd:
                canonical[key] = gd[key]
        side = _normalize_side(canonical.get("side"))
        if side:
            canonical["side"] = side
        sym = _normalize_symbol(canonical.get("symbol"))
        if sym:
            canonical["symbol"] = sym
        mode = (fmt.mode_hint or "").upper()
        if mode in {"PIPS", "PRICE", "SHORTHAND"}:
            canonical["mode"] = mode
        else:
            canonical["mode"] = _infer_mode(canonical)
        out = ParseOutcome(matched=True, parser_used=f"TEMPLATE:{fmt.name}", mode=canonical.get("mode"), canonical=canonical)
        out.normalized_text = text
        return _score_and_validate(out)
    return None


def _normalize_side(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).upper().strip()
    return SIDE_ALIASES.get(s)


def _infer_mode(canonical: dict[str, Any]) -> str | None:
    if any(k in canonical for k in ["entry_lo", "entry_hi", "sl_price", "tp1_price"]):
        return "PRICE"
    if any(k in canonical for k in ["entry1", "entry2", "sl", "tp1", "tp2"]):
        return "SHORTHAND"
    if any(k in canonical for k in ["entry", "sl_pips", "tp1_pips"]):
        return "PIPS"
    return None


def _parse_standard_price(text: str) -> ParseOutcome | None:
    side = _find_side(text)
    symbol = _find_symbol(text)
    if not side:
        return None

    # examples: BUY GOLD 2645-2650 / XAUUSD BUY 2645 / 2650
    range_pat = re.search(r"\b(?:BUY|SELL|LONG|SHORT|COMPRA|VENDI)\b(?:\s+[A-Z]{3,10})?\s+(\d{1,6}(?:\.\d{1,5})?)\s*[-/]\s*(\d{1,6}(?:\.\d{1,5})?)", text)
    if not range_pat:
        range_pat = re.search(r"\b(?:XAUUSD|XAGUSD|GOLD|XAU|[A-Z]{6,10})\b\s+\b(?:BUY|SELL|LONG|SHORT|COMPRA|VENDI)\b\s+(\d{1,6}(?:\.\d{1,5})?)\s*[-/]\s*(\d{1,6}(?:\.\d{1,5})?)", text)
    sl = re.search(r"\b(?:STOP\s*LOSS|SL)\s*[: ]\s*(\d{1,6}(?:\.\d{1,5})?)", text)
    tps = _extract_tps_price(text)
    if range_pat and sl:
        canonical: dict[str, Any] = {
            "mode": "PRICE",
            "symbol": symbol or "XAUUSD",
            "side": side,
            "entry_lo": float(range_pat.group(1)),
            "entry_hi": float(range_pat.group(2)),
            "sl_price": float(sl.group(1)),
            **tps,
        }
        out = ParseOutcome(matched=True, parser_used="STANDARD:PRICE_RANGE", mode="PRICE", canonical=canonical, normalized_text=text)
        return _score_and_validate(out)

    # Support single entry price: BTCUSD BUY 84003 SL 83000 TP 95500
    single_entry_pat = re.search(r"\b(?:BUY|SELL|LONG|SHORT|COMPRA|VENDI)\b(?:\s+[A-Z]{3,10})?\s+(\d{1,6}(?:\.\d{1,5})?)\b", text)
    if not single_entry_pat:
        single_entry_pat = re.search(r"\b(?:XAUUSD|XAGUSD|GOLD|XAU|BTCUSD|ETHUSD|GBPUSD|EURUSD|[A-Z]{6,10})\b\s+(?:BUY|SELL|LONG|SHORT|COMPRA|VENDI)\s+(\d{1,6}(?:\.\d{1,5})?)\b", text)
    sl = re.search(r"\b(?:STOP\s*LOSS|SL)\s*[: ]\s*(\d{1,6}(?:\.\d{1,5})?)", text)
    tps = _extract_tps_price(text)
    if single_entry_pat and sl:
        canonical: dict[str, Any] = {
            "mode": "PRICE",
            "symbol": symbol or "XAUUSD",
            "side": side,
            "entry_lo": float(single_entry_pat.group(1)),
            "entry_hi": float(single_entry_pat.group(1)),
            "sl_price": float(sl.group(1)),
            **tps,
        }
        out = ParseOutcome(matched=True, parser_used="STANDARD:PRICE_SINGLE", mode="PRICE", canonical=canonical, normalized_text=text)
        return _score_and_validate(out)

    return None


def _parse_standard_pips(text: str) -> ParseOutcome | None:
    side = _find_side(text)
    symbol = _find_symbol(text)
    if not side:
        return None
    m_entry = re.search(r"@\s*(\d{1,6}(?:\.\d{1,5})?)", text) or re.search(r"\bENTRY\s*[: ]\s*(\d{1,6}(?:\.\d{1,5})?)", text)
    if not m_entry:
        # fallback after side+symbol
        m_entry = re.search(r"\b(?:BUY|SELL|LONG|SHORT|COMPRA|VENDI)\b(?:\s+[A-Z]{3,10})?\s+(\d{1,6}(?:\.\d{1,5})?)\b", text)
    m_sl_pips = re.search(r"\bSL\s*[: ]\s*(\d{1,5})\s*(?:PIP|PIPS)\b", text)
    if not m_sl_pips:
        # if explicit "PIPS" appears anywhere, allow shorthand SL numeric
        if "PIP" in text:
            m_sl_pips = re.search(r"\bSL\s*[: ]\s*(\d{1,5})\b", text)
    tps = _extract_tps_pips(text)
    if m_entry and m_sl_pips and tps.get("tp1_pips"):
        canonical = {
            "mode": "PIPS",
            "symbol": symbol or "XAUUSD",
            "side": side,
            "entry": float(m_entry.group(1)),
            "sl_pips": int(m_sl_pips.group(1)),
            "tp1_pips": int(tps["tp1_pips"]),
            "tp2_pips": int(tps.get("tp2_pips", tps["tp1_pips"])),
            "tp3_pips": int(tps.get("tp3_pips", tps["tp1_pips"])),
        }
        out = ParseOutcome(matched=True, parser_used="STANDARD:PIPS", mode="PIPS", canonical=canonical, normalized_text=text)
        return _score_and_validate(out)
    return None


def _parse_standard_shorthand(text: str) -> ParseOutcome | None:
    side = _find_side(text)
    symbol = _find_symbol(text)
    # typical shorthand is mostly XAU/GOLD with 2-3 digit shorthand values
    if side is None:
        return None
    m = re.search(r"\b(?:XAU|GOLD)\b.*?\b(?:BUY|SELL|LONG|SHORT)\b\s+(\d{2,4})\s*/\s*(\d{2,4})", text)
    if not m:
        m = re.search(r"\b(?:BUY|SELL|LONG|SHORT)\b\s+(?:XAU|GOLD)\s+(\d{2,4})\s*/\s*(\d{2,4})", text)
    if not m:
        return None
    msl = re.search(r"\bSL\s*[: ]\s*(\d{1,4})\b", text)
    mtp = re.search(r"\bTP\s*[: ]\s*(\d{1,4})\s*/\s*(\d{1,4})", text)
    mtp1 = re.search(r"\bTP1\s*[: ]\s*(\d{1,4})", text)
    mtp2 = re.search(r"\bTP2\s*[: ]\s*(\d{1,4})", text)
    if not msl:
        return None
    tp1 = None
    tp2 = None
    tp3 = None
    if mtp:
        tp1, tp2 = int(mtp.group(1)), int(mtp.group(2))
    else:
        tp1 = int(mtp1.group(1)) if mtp1 else None
        tp2 = int(mtp2.group(1)) if mtp2 else None
    if tp1 is None or tp2 is None:
        return None
    canonical = {
        "mode": "SHORTHAND",
        "symbol": symbol or "XAUUSD",
        "side": side,
        "entry1": int(m.group(1)),
        "entry2": int(m.group(2)),
        "sl": int(msl.group(1)),
        "tp1": int(tp1),
        "tp2": int(tp2),
        "tp3": int(tp3) if tp3 else 0,
    }
    out = ParseOutcome(matched=True, parser_used="STANDARD:SHORTHAND", mode="SHORTHAND", canonical=canonical, normalized_text=text)
    return _score_and_validate(out)


def _heuristic_parse(text: str) -> ParseOutcome | None:
    side = _find_side(text)
    symbol = _find_symbol(text)
    if not side:
        return None

    # gather likely numeric tagged fields
    m_sl_price = re.search(r"\b(?:SL|STOP\s*LOSS)\s*[: ]\s*(\d{1,6}(?:\.\d{1,5})?)\b", text)
    m_sl_pips = re.search(r"\b(?:SL|STOP\s*LOSS)\s*[: ]\s*(\d{1,5})\s*(?:PIP|PIPS)\b", text)
    tps_price = _extract_tps_price(text)
    tps_pips = _extract_tps_pips(text)

    # explicit price range
    m_range = re.search(r"(\d{1,6}(?:\.\d{1,5})?)\s*[-/]\s*(\d{1,6}(?:\.\d{1,5})?)", text)
    if m_range and (m_sl_price or tps_price):
        a, b = float(m_range.group(1)), float(m_range.group(2))
        canonical = {
            "mode": "PRICE",
            "symbol": symbol or "XAUUSD",
            "side": side,
            "entry_lo": min(a, b),
            "entry_hi": max(a, b),
            **tps_price,
        }
        if m_sl_price:
            canonical["sl_price"] = float(m_sl_price.group(1))
        out = ParseOutcome(matched=True, parser_used="HEURISTIC:PRICE", mode="PRICE", canonical=canonical, normalized_text=text)
        out = _score_and_validate(out)
        out.confidence = min(out.confidence, 82)
        return out

    # PIPS mode if "PIP" mentioned
    if "PIP" in text:
        m_entry = re.search(r"@\s*(\d{1,6}(?:\.\d{1,5})?)", text) or re.search(r"\b(?:BUY|SELL|LONG|SHORT)\b.*?(\d{1,6}(?:\.\d{1,5})?)\b", text)
        if m_entry and (m_sl_pips or re.search(r"\bSL\s*[: ]\s*(\d{1,5})\b", text)) and (tps_pips.get("tp1_pips") or tps_pips):
            sl = m_sl_pips.group(1) if m_sl_pips else re.search(r"\bSL\s*[: ]\s*(\d{1,5})\b", text).group(1)
            canonical = {
                "mode": "PIPS",
                "symbol": symbol or "XAUUSD",
                "side": side,
                "entry": float(m_entry.group(1)),
                "sl_pips": int(sl),
                "tp1_pips": int(tps_pips.get("tp1_pips", 0) or 0),
                "tp2_pips": int(tps_pips.get("tp2_pips", tps_pips.get("tp1_pips", 0)) or 0),
                "tp3_pips": int(tps_pips.get("tp3_pips", tps_pips.get("tp1_pips", 0)) or 0),
            }
            out = ParseOutcome(matched=True, parser_used="HEURISTIC:PIPS", mode="PIPS", canonical=canonical, normalized_text=text)
            out = _score_and_validate(out)
            out.confidence = min(out.confidence, 78)
            return out

    # single-entry price fallback
    m_entry_single = re.search(r"@\s*(\d{1,6}(?:\.\d{1,5})?)", text) or re.search(r"\bENTRY\s*[: ]\s*(\d{1,6}(?:\.\d{1,5})?)", text)
    if m_entry_single and (m_sl_price or tps_price):
        canonical = {
            "mode": "PRICE",
            "symbol": symbol or "XAUUSD",
            "side": side,
            "entry": float(m_entry_single.group(1)),
            **tps_price,
        }
        if m_sl_price:
            canonical["sl_price"] = float(m_sl_price.group(1))
        out = ParseOutcome(matched=True, parser_used="HEURISTIC:PRICE_SINGLE", mode="PRICE", canonical=canonical, normalized_text=text)
        out = _score_and_validate(out)
        out.confidence = min(out.confidence, 72)
        return out

    return None


def parse_signal(text: str, *, template_formats: list[SignalFormat] | None = None) -> ParseOutcome:
    norm = normalize_signal_text(text)
    template_formats = template_formats or []

    # 1) room templates
    out = _apply_template_formats(norm, template_formats)
    if out:
        return out

    # 2) standard formats
    for fn in (_parse_standard_shorthand, _parse_standard_price, _parse_standard_pips):
        out = fn(norm)
        if out:
            return out

    # 3) heuristic fallback
    out = _heuristic_parse(norm)
    if out:
        return out

    return ParseOutcome(
        matched=False,
        parser_used=None,
        confidence=0,
        mode=None,
        canonical={},
        warnings=[],
        errors=["Formato non riconosciuto"],
        validation={"valid_logic": False, "checks": ["parse_failed"]},
        normalized_text=norm,
    )


def canonical_to_bridge_payload(canonical: dict[str, Any], *, source_chat_id: int | str | None = None) -> dict[str, Any]:
    mode = canonical.get("mode")
    payload = {
        "mode": mode,
        "format": canonical.get("format") or mode,
        "symbol": canonical.get("symbol", "XAUUSD"),
        "side": canonical.get("side"),
        "src_chat": int(source_chat_id) if str(source_chat_id).lstrip("-").isdigit() else 0,
        "exec": canonical.get("exec", "AUTO"),
        "threshold_pips": int(canonical.get("threshold_pips", 15) or 15),
        "comment": "SoftiBridge",
    }
    if mode == "PIPS":
        payload.update({
            "entry": _to_float(canonical.get("entry")),
            "sl_pips": _to_int(canonical.get("sl_pips")),
            "tp1_pips": _to_int(canonical.get("tp1_pips")),
            "tp2_pips": _to_int(canonical.get("tp2_pips")) or _to_int(canonical.get("tp1_pips")),
            "tp3_pips": _to_int(canonical.get("tp3_pips")) or _to_int(canonical.get("tp1_pips")),
        })
    elif mode == "PRICE":
        if _to_float(canonical.get("entry")) is not None:
            v = _to_float(canonical.get("entry"))
            payload["entry_lo"] = v
            payload["entry_hi"] = v
        else:
            payload["entry_lo"] = _to_float(canonical.get("entry_lo"))
            payload["entry_hi"] = _to_float(canonical.get("entry_hi"))
        payload.update({
            "sl_price": _to_float(canonical.get("sl_price")),
            "tp1_price": _to_float(canonical.get("tp1_price")),
            "tp2_price": _to_float(canonical.get("tp2_price")),
            "tp3_price": _to_float(canonical.get("tp3_price")),
            "tp4_price": _to_float(canonical.get("tp4_price")),
            "tp_open": canonical.get("tp_open"),
            "open": int(canonical.get("open", 0) or 0),
        })
    elif mode == "SHORTHAND":
        payload.update({
            "entry1": _to_int(canonical.get("entry1")),
            "entry2": _to_int(canonical.get("entry2")),
            "sl": _to_int(canonical.get("sl")),
            "tp1": _to_int(canonical.get("tp1")),
            "tp2": _to_int(canonical.get("tp2")),
            "tp3": _to_int(canonical.get("tp3")) or 0,
            "open": int(canonical.get("open", 0) or 0),
        })
    return payload

