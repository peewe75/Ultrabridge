import psycopg2

password = "SoftiBridgeAdmin2026"
host = "aws-0-eu-west-1.pooler.supabase.com"
port = 6543
dbname = "postgres"
user = "postgres.wwcimpvxhchaqdkgffoh"

try:
    print(f"Tentativo con options project ID...")
    conn = psycopg2.connect(
        user=user,
        password=password,
        host=host,
        port=port,
        database=dbname,
        options="-c project=wwcimpvxhchaqdkgffoh"
    )
    print("--- SUCCESSO con options! ---")
    conn.close()
except Exception as e:
    print(f"FALLITO con options: {e}")
