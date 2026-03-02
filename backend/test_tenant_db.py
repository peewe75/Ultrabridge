import psycopg2

password = "SoftiBridgeAdmin2026"
host = "aws-0-eu-west-1.pooler.supabase.com"
port = 6543
user = "postgres"
dbname = "wwcimpvxhchaqdkgffoh.postgres" # Tenant in db name

try:
    print(f"Tentativo con tenant nel nome del DB...")
    conn = psycopg2.connect(
        user=user,
        password=password,
        host=host,
        port=port,
        database=dbname,
        sslmode='require'
    )
    print("--- SUCCESSO con tenant-in-db! ---")
    conn.close()
except Exception as e:
    print(f"FALLITO con tenant-in-db: {e}")
