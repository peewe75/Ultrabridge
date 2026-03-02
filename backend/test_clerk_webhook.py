import asyncio
import os

# Setup environment to connect to Supabase
os.environ["DATABASE_URL"] = "postgresql+psycopg2://postgres.wwcimpvxhchaqdkgffoh:SoftiBridgeAdmin2026@aws-1-eu-west-1.pooler.supabase.com:6543/postgres"
from app.db import SessionLocal
from app.routers.clerk_webhooks import _apply_user_upsert
from app.models import User, Client

def run_test():
    print("Testing _apply_user_upsert (Webhook Sync)...")
    db = SessionLocal()
    try:
        mock_user_event_data = {
            "id": "clerk_webhook_123",
            "email_addresses": [
                {
                    "id": "em_1",
                    "email_address": "test_webhook@softibridge.com"
                }
            ],
            "primary_email_address_id": "em_1",
            "banned": False,
            "locked": False,
            "deleted": False
        }
        
        # Simulate 'user.created'
        print("Triggering user.created...")
        result = _apply_user_upsert(db, mock_user_event_data, "user.created")
        db.commit() # Important! The webhook router commits *after* calling the upsert func
        
        print(f"Result logic mapping: {result}")
        sql_user_id = result.get("user_id")
        
        # Verify db
        db_user = db.query(User).filter(User.clerk_user_id == "clerk_webhook_123").one_or_none()
        db_client = db.query(Client).filter(Client.user_id == sql_user_id).one_or_none()
        
        if db_user and db_client:
            print("SUCCESS! User and Client records were found in the database via Webhook logic.")
        else:
            print(f"FAILURE! Missing records. User: {bool(db_user)}, Client: {bool(db_client)}")

        # Clean up
        if db_client:
            db.delete(db_client)
        if db_user:
            db.delete(db_user)
        db.commit()
        print("Cleaned up webhooks test user.")
        
    except Exception as e:
        print(f"Exception during test: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run_test()
