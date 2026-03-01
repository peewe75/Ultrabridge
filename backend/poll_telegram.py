import time
import json
import urllib.request
import urllib.error
from pathlib import Path

# Configurazione locale
BACKEND_URL = "http://127.0.0.1:8000/api/telegram/webhook"
CONFIG_FILE = Path(r"C:\Users\avvsa\OneDrive - AVVOCATO SAPONE\Desktop\Marco\test spazzatura\MVP\Credenziali\telegram\BOT_CONFIG.json")

def load_config():
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

def poll():
    config = load_config()
    token = config.get("telegram_bot_token")
    if not token:
        print("[!] Errore: Token non trovato nel config.")
        return

    print(f"[*] Avviando Polling Telegram locale (Token: {token[:10]}...)")
    offset = 0
    while True:
        try:
            url = f"https://api.telegram.org/bot{token}/getUpdates?offset={offset}&timeout=10"
            with urllib.request.urlopen(url, timeout=11) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            
            if not data.get("ok"):
                print(f"[!] Errore Telegram: {data}")
                time.sleep(5)
                continue

            for update in data.get("result", []):
                offset = update["update_id"] + 1
                print(f"[*] Messaggio ricevuto via Telegram (Update ID: {update['update_id']})")
                
                # Inoltra al backend (webhook locale)
                try:
                    req = urllib.request.Request(
                        BACKEND_URL, 
                        data=json.dumps(update).encode("utf-8"), 
                        method="POST"
                    )
                    req.add_header("Content-Type", "application/json")
                    req.add_header("X-Telegram-Bot-Api-Secret-Token", "softibridge-webhook-secret-2026")
                    with urllib.request.urlopen(req, timeout=5) as forward_resp:
                        print(f"    -> Inoltrato al backend: {forward_resp.status}")
                except urllib.error.URLError as e:
                    print(f"    [!] Errore nell'inoltro al backend: {e}")

        except Exception as e:
            print(f"[!] Errore durante il polling: {e}")
            time.sleep(5)
        
        time.sleep(1)

if __name__ == "__main__":
    poll()
