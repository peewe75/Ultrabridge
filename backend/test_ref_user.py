import psycopg2

password = "SoftiBridgeAdmin2026"
host = "aws-0-eu-west-1.pooler.supabase.com"
port = 6543
user = "wwcimpvxhchaqdkgffoh" # Project ref as user
dbname = "postgres"

try:
    print(f"Tentativo con project ref come utente...")
    conn = psycopg2.connect(
        user=user,
        password=password,
        host=host,
        port=port,
        database=dbname,
        sslmode='require'
    )
    print("--- SUCCESSO con ref-user! ---")
    conn.close()
except Exception as e:
    print(f"FALLITO con ref-user: {e}")
