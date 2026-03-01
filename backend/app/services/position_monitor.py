from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.db import SessionLocal
from app.models import Client
from app.services.bridge_files import resolve_bridge_paths
from app.services.telegram_service import send_message


class PositionMonitor:
    def __init__(self, poll_interval: float = 1.0):
        self.poll_interval = poll_interval
        self._running = False
        self._thread: threading.Thread | None = None
        self._last_state: dict[str, dict[str, Any]] = {}

    def _read_positions(self) -> list[dict[str, Any]]:
        paths = resolve_bridge_paths()
        mt4_positions = paths.state / "positions_mt4.txt"
        if not mt4_positions.exists():
            return []
        
        try:
            content = mt4_positions.read_text(encoding="utf-8", errors="replace")
        except Exception:
            return []
        
        positions = []
        for line in content.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split(";")
            pos = {}
            for part in parts:
                if "=" in part:
                    k, v = part.split("=", 1)
                    pos[k] = v
            if pos:
                positions.append(pos)
        return positions

    def _get_client_chat_ids(self) -> dict[str, str]:
        db = SessionLocal()
        try:
            clients = db.query(Client).filter(Client.telegram_chat_id.isnot(None)).all()
            return {c.id: c.telegram_chat_id for c in clients}
        finally:
            db.close()

    def _send_notification(self, chat_id: str, message: str):
        try:
            send_message(chat_id, message)
        except Exception as e:
            print(f"[PositionMonitor] Errore invio notifica: {e}")

    def _process_position(self, pos: dict[str, Any], client_chat_ids: dict[str, str]):
        ticket = pos.get("ticket") or pos.get("id")
        if not ticket:
            return
        
        key = f"mt4_{ticket}"
        prev = self._last_state.get(key, {})
        
        symbol = pos.get("symbol", "?")
        side = pos.get("side", pos.get("type", "?"))
        status = pos.get("status", "")
        comment = pos.get("comment", "")
        
        client_id = None
        for cid, chat in client_chat_ids.items():
            if cid in comment:
                client_id = cid
                chat_id = chat
                break
        
        if not client_id:
            return
        
        if status and status != prev.get("status"):
            if "TP" in status.upper():
                tp_num = status.upper().replace("TP", "").strip()
                if not tp_num:
                    tp_num = "1"
                msg = f"🎯 TP{tp_num} preso su {symbol} ticket {ticket}"
                self._send_notification(chat_id, msg)
            elif "SL" in status.upper() or "LOSS" in status.upper():
                msg = f"❌ Stop Loss su {symbol} ticket {ticket}"
                self._send_notification(chat_id, msg)
            elif status.upper() == "CLOSED":
                msg = f"✅ Posizione chiusa su {symbol} ticket {ticket}"
                self._send_notification(chat_id, msg)
        
        self._last_state[key] = dict(pos)

    def _run(self):
        while self._running:
            try:
                positions = self._read_positions()
                client_chat_ids = self._get_client_chat_ids()
                
                for pos in positions:
                    self._process_position(pos, client_chat_ids)
                    
            except Exception as e:
                print(f"[PositionMonitor] Errore: {e}")
            
            time.sleep(self.poll_interval)

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        print("[PositionMonitor] Avviato")

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        print("[PositionMonitor] Fermato")


_position_monitor: PositionMonitor | None = None


def get_position_monitor() -> PositionMonitor:
    global _position_monitor
    if _position_monitor is None:
        _position_monitor = PositionMonitor(poll_interval=1.0)
    return _position_monitor


def start_position_monitor():
    get_position_monitor().start()


def stop_position_monitor():
    global _position_monitor
    if _position_monitor:
        _position_monitor.stop()
        _position_monitor = None
