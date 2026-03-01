from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import (
    AdminBranding,
    AdminOperationalLimits,
    AdminPlan,
    AdminSubscription,
    AdminWL,
    AuditLog,
    Client,
    License,
    User,
)
from app.security import create_access_token, hash_password


def ensure_demo_admin(db: Session, email: str = "admin.demo@example.com", password: str = "Password123!") -> dict:
    user = db.query(User).filter(User.email == email).one_or_none()
    if not user:
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            password_hash=hash_password(password),
            role="ADMIN_WL",
            status="ACTIVE",
        )
        db.add(user)
        db.flush()
        db.add(AuditLog(
            id=str(uuid.uuid4()),
            actor_type="SYSTEM",
            action="DEMO_ADMIN_CREATED",
            entity_type="USER",
            entity_id=user.id,
            details={"email": email},
        ))
    admin_wl = db.query(AdminWL).filter((AdminWL.user_id == user.id) | (AdminWL.email == email)).first()
    if not admin_wl:
        plan = db.query(AdminPlan).filter(AdminPlan.code == "BASIC").one_or_none()
        now = datetime.now(timezone.utc)
        admin_wl = AdminWL(
            id=str(uuid.uuid4()),
            user_id=user.id,
            email=email,
            contact_name="Demo Admin",
            brand_name="Demo White Label",
            status="ACTIVE",
            admin_plan_code=plan.code if plan else None,
            fee_pct_l1=70,
            notes="Demo profile",
        )
        db.add(admin_wl)
        db.flush()
        db.add(AdminSubscription(
            id=str(uuid.uuid4()),
            admin_wl_id=admin_wl.id,
            admin_plan_code=(plan.code if plan else "BASIC"),
            status="ACTIVE",
            billing_cycle="MONTHLY",
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
            auto_renew=True,
        ))
        db.add(AdminOperationalLimits(
            id=str(uuid.uuid4()),
            admin_wl_id=admin_wl.id,
            source="PLAN",
            limits_json=(plan.default_limits if plan else {"max_clients": 50, "max_active_licenses": 100, "max_affiliates": 10, "max_vps_nodes": 2}),
        ))
        db.add(AdminBranding(
            id=str(uuid.uuid4()),
            admin_wl_id=admin_wl.id,
            brand_name="Demo White Label",
            sender_name="Demo White Label",
            sender_email=email,
            primary_color="#22c55e",
            secondary_color="#0f172a",
            config_json={},
        ))
        db.add(AuditLog(
            id=str(uuid.uuid4()),
            actor_type="SYSTEM",
            action="DEMO_ADMIN_WL_CREATED",
            entity_type="ADMIN_WL",
            entity_id=admin_wl.id,
            details={"email": email},
        ))
    elif not admin_wl.user_id:
        admin_wl.user_id = user.id

    token, expires = create_access_token(user.id, user.role)
    return {"user": user, "token": token, "expires_in": expires, "password": password}


def ensure_demo_client(db: Session, email: str = "mario.rossi@example.com", password: str = "Password123!") -> dict:
    user = db.query(User).filter(User.email == email).one_or_none()
    if not user:
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            password_hash=hash_password(password),
            role="CLIENT",
            status="ACTIVE",
        )
        db.add(user)
        db.flush()

    client = db.query(Client).filter(Client.email == email).one_or_none()
    if not client:
        client = Client(
            id=str(uuid.uuid4()),
            user_id=user.id,
            full_name="Mario Rossi",
            telegram_username="@mario_rossi",
            email=email,
            phone="+39 333 0000000",
            country_code="IT",
            fiscal_profile={"is_business": False},
            status="ACTIVE",
        )
        db.add(client)
        db.flush()
    else:
        if not client.user_id:
            client.user_id = user.id

    lic = db.query(License).filter(License.client_id == client.id).order_by(License.created_at.desc()).first()
    if not lic:
        lic = License(
            id=f"SB-{uuid.uuid4().hex[:8].upper()}",
            client_id=client.id,
            plan_code="PRO",
            status="ACTIVE",
            expiry_at=datetime.now(timezone.utc) + timedelta(days=30),
            install_id="DEMO-VPS-01",
            mt_accounts={"MT4": ["87654321"], "MT5": []},
        )
        db.add(lic)
        db.flush()

    token, expires = create_access_token(user.id, user.role)
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="SYSTEM",
        action="DEMO_CLIENT_READY",
        entity_type="CLIENT",
        entity_id=client.id,
        details={"email": email, "license_id": lic.id},
    ))
    return {"user": user, "client": client, "license": lic, "token": token, "expires_in": expires, "password": password}
