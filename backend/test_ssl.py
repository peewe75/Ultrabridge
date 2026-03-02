import psycopg2

password = "SoftiBridgeAdmin2026"
host = "aws-0-eu-west-1.pooler.supabase.com"
port = 6543
dbname = "postgres"
user = "postgres.wwcimpvxhchaqdkgffoh"

try:
    print(f"Tentativo con SSL require e raw connect...")
    conn = psycopg2.connect(
        user=user,
        password=password,
        host=host,
        port=port,
        database=dbname,
        sslmode='require'
    )
    print("--- SUCCESSO con SSL! ---")
    conn.close()
except Exception as e:
    print(f"FALLITO con SSL: {e}")
