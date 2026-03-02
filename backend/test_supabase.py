import sys
import os

# Aggiungi il percorso corrente per caricare i moduli del progetto
sys.path.append(os.getcwd())

try:
    from app.db import Base, engine
    from app.models import User, Plan, License, Download # Importa i modelli per registrarli
    
    print("Connessione a Supabase in corso...")
    Base.metadata.create_all(bind=engine)
    print("SUCCESSO! Tabelle create su Supabase.")
except Exception as e:
    print(f"ERRORE di connessione: {e}")
