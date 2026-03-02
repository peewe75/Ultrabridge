import asyncio
import os
from unittest.mock import patch

# Setup environment to connect to Supabase
os.environ["DATABASE_URL"] = "postgresql+psycopg2://postgres.wwcimpvxhchaqdkgffoh:SoftiBridgeAdmin2026@aws-1-eu-west-1.pooler.supabase.com:6543/postgres"
from app.db import SessionLocal
from app.deps import _sync_user_from_clerk
from app.models import User

# Define a mock class mapping to what verify_clerk_bearer_token normally returns
class MockClerkIdentity:
    def __init__(self, user_id, email):
        self.user_id = user_id
        self.email = email
        self.session_id = "mock_session_id"

def run_test():
    print("Testing _sync_user_from_clerk...")
    db = SessionLocal()
    try:
        # Mock verify_clerk_bearer_token to return our MockClerkIdentity
        with patch("app.deps.verify_clerk_bearer_token") as mock_verify:
            mock_verify.return_value = MockClerkIdentity(
                user_id="user_test_12345",
                email="test_sync@softibridge.com"
            )
            
            # Call the sync function with a fake token
            user = _sync_user_from_clerk("fake_jwt_token", db)
            print(f"Sync function returned user ID: {user.id}, email: {user.email}")
            
            # Verify user is in DB
            db_user = db.query(User).filter(User.clerk_user_id == "user_test_12345").one_or_none()
            if db_user:
                print("SUCCESS! User was found in the database.")
            else:
                print("FAILURE! User was not inserted into the database.")
                
            # Clean up
            if db_user:
                db.delete(db_user)
                db.commit()
                print("Cleaned up test user.")
                
    except Exception as e:
        print(f"Exception during test: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_test()
