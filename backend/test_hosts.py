import psycopg2

password = "SoftiBridgeAdmin2026"
dbname = "postgres"
user = "postgres.wwcimpvxhchaqdkgffoh"
port = 6543

test_hosts = [
    "aws-0-eu-west-1.pooler.supabase.com",
    "db.wwcimpvxhchaqdkgffoh.supabase.co",
    "db.wwcimpvxhchaqdkgffoh.supabase.com",
    "wwcimpvxhchaqdkgffoh.supabase.co",
    "wwcimpvxhchaqdkgffoh.supabase.com"
]

for host in test_hosts:
    try:
        print(f"Tentativo con host: {host} (porta {port})...")
        conn = psycopg2.connect(
            user=user,
            password=password,
            host=host,
            port=port,
            database=dbname,
            sslmode='require'
        )
        print(f"--- SUCCESSO con {host}! ---")
        conn.close()
        break
    except Exception as e:
        print(f"FALLITO ({host}): {e}")
