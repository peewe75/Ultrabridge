import argparse
import sys
from pathlib import Path

# Aggiungi la root del progetto al path per caricare i moduli dell'app
sys.path.append(str(Path(__file__).resolve().parent))

from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import User

def promote_user(email: str, role: str):
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one_or_none()
        if not user:
            print(f"Errore: Utente con email '{email}' non trovato nel database.")
            print("Assicurati di esserti già registrato su Clerk/Landing Page prima di eseguire questo script.")
            return

        print(f"Utente trovato: {user.email} (ID: {user.id}, Ruolo attuale: {user.role})")
        user.role = role.upper()
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"SUCCESSO: Ruolo aggiornato a {user.role}")
    except Exception as e:
        print(f"Errore durante l'aggiornamento: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promuove un utente a SUPER_ADMIN o ADMIN_WL")
    parser.add_argument("--email", required=True, help="Email dell'utente da promuovere")
    parser.add_argument("--role", default="SUPER_ADMIN", choices=["SUPER_ADMIN", "ADMIN_WL", "AFFILIATE", "CLIENT"], help="Nuovo ruolo (default: SUPER_ADMIN)")
    
    args = parser.parse_args()
    promote_user(args.email, args.role)
