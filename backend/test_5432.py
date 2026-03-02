import psycopg2

password = "SoftiBridgeAdmin2026"
host = "aws-0-eu-west-1.pooler.supabase.com"
port = 5432
dbname = "postgres"
user = "postgres.wwcimpvxhchaqdkgffoh"

try:
    print(f"Tentativo con porta 5432 sull'host pooler...")
    conn = psycopg2.connect(
        user=user,
        password=password,
        host=host,
        port=port,
        database=dbname,
        sslmode='require'
    )
    print("--- SUCCESSO con 5432! ---")
    conn.close()
except Exception as e:
    print(f"FALLITO con 5432: {e}")
