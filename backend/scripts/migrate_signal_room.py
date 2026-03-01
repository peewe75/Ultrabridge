"""
Migrazione: aggiunge signal_room_id alla tabella clients
Compatibile con psycopg (v3) e SQLite.

Uso:
    python scripts/migrate_signal_room.py
"""
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)

# Carica .env manualmente (senza dipendenze extra)
def load_dotenv(path):
    env = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env

env = load_dotenv(os.path.join(BACKEND_DIR, ".env"))
DB_URL = env.get("DATABASE_URL") or os.environ.get("DATABASE_URL", "")

print(f"DATABASE_URL: {DB_URL[:55]}...")
is_sqlite = DB_URL.startswith("sqlite") or not DB_URL

# ─────────────────────────────────────────────────────────────
# SQLite
# ─────────────────────────────────────────────────────────────
if is_sqlite:
    import sqlite3

    path = DB_URL.replace("sqlite:///", "").replace("sqlite://", "") if DB_URL else ""
    if not path or path == ":memory:":
        candidates = [f for f in os.listdir(BACKEND_DIR) if f.endswith(".db")]
        if not candidates:
            print("❌ Nessun file .db trovato nella cartella backend.")
            sys.exit(1)
        path = os.path.join(BACKEND_DIR, candidates[0])
    elif path.startswith("./"):
        path = os.path.join(BACKEND_DIR, path[2:])

    print(f"File DB: {path}")
    con = sqlite3.connect(path)
    cur = con.cursor()

    cur.execute("PRAGMA table_info(clients)")
    cols = [row[1] for row in cur.fetchall()]
    print(f"Colonne attuali: {cols}")

    if "signal_room_id" in cols:
        print("✅ Colonna signal_room_id GIA' presente — nulla da fare.")
    else:
        cur.execute("ALTER TABLE clients ADD COLUMN signal_room_id VARCHAR")
        print("✅ ADD COLUMN signal_room_id OK")

    cur.execute("CREATE INDEX IF NOT EXISTS idx_clients_signal_room_id ON clients(signal_room_id)")
    print("✅ INDEX OK")

    con.commit()
    con.close()
    print("\n🎉 Migrazione SQLite completata!")
    sys.exit(0)

# ─────────────────────────────────────────────────────────────
# PostgreSQL tramite psycopg (v3) o psycopg2 come fallback
# ─────────────────────────────────────────────────────────────

# Normalizza URL: psycopg3 usa "postgresql+psycopg://", psycopg2 usa "postgresql://"
clean_url = (DB_URL
    .replace("postgresql+psycopg://", "postgresql://")
    .replace("postgresql+psycopg2://", "postgresql://"))

try:
    import psycopg as pg3
    USE_PG3 = True
    print("Driver: psycopg v3")
except ImportError:
    USE_PG3 = False
    try:
        import psycopg2 as pg3
        print("Driver: psycopg2")
    except ImportError:
        print("❌ Nessun driver psycopg installato.")
        print("   Prova: pip install psycopg  oppure  pip install psycopg2-binary")
        sys.exit(1)

try:
    con = pg3.connect(clean_url)
except Exception as e:
    print(f"❌ Connessione fallita: {e}")
    sys.exit(1)

con.autocommit = False
cur = con.cursor()

# Verifica colonna
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name='clients' AND column_name='signal_room_id'
""")
exists = bool(cur.fetchone())

if exists:
    print("✅ Colonna signal_room_id GIA' presente — salto ADD COLUMN.")
else:
    print("⏳ ADD COLUMN signal_room_id ...")
    cur.execute("""
        ALTER TABLE clients
        ADD COLUMN signal_room_id VARCHAR
        REFERENCES signal_rooms(id)
    """)
    print("✅ ADD COLUMN OK")

# Index idempotente
print("⏳ CREATE INDEX ...")
cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_clients_signal_room_id
    ON clients(signal_room_id)
""")
print("✅ INDEX OK")

con.commit()
cur.close()
con.close()
print("\n🎉 Migrazione PostgreSQL completata con successo!")
