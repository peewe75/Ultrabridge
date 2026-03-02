import psycopg2

try:
    print("Tentativo di connessione diretta con raw psycopg2...")
    conn = psycopg2.connect(
        "postgresql://postgres.wwcimpvxhchaqdkgffoh:SoftiBridgeAdmin2026@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
    )
    print("CONNESSO!")
    conn.close()
except Exception as e:
    print(f"ERRORE RAW: {e}")
