import psycopg2

password = "SoftiBridgeAdmin2026"
host = "aws-0-eu-west-1.pooler.supabase.com"
port = 6543
dbname = "postgres"

test_users = [
    "postgres.wwcimpvxhchaqdkgffoh",
    "postgres",
    "wwcimpvxhchaqdkgffoh",
    "postgres@wwcimpvxhchaqdkgffoh"
]

for user in test_users:
    try:
        print(f"Tentativo con utente: {user}...")
        conn = psycopg2.connect(
            user=user,
            password=password,
            host=host,
            port=port,
            database=dbname
        )
        print(f"--- SUCCESSO con {user}! ---")
        conn.close()
        break
    except Exception as e:
        print(f"FALLITO ({user}): {e}")
