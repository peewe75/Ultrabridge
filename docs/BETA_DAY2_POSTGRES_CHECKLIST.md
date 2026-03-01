# SoftiBridge - Day 2 PostgreSQL Checklist

## Goal
Move from local SQLite to PostgreSQL staging with same smoke coverage.

## 1) Start PostgreSQL
From `backend/`:

```bash
docker compose -f docker-compose.postgres.yml up -d
```

## 2) Update `.env`
Set:

- `DATABASE_URL=postgresql+psycopg://softi_user:softi_pass@127.0.0.1:5432/softibridge`

Keep other beta values unchanged.

## 3) Start backend
Use:

```bat
scripts\start_beta_local.bat
```

## 4) Verify
Run in another terminal:

```bat
scripts\\verify_beta_local.bat
```

Expected: smoke test full PASS.

## 5) Rollback (if needed)
Restore SQLite quickly:

- `DATABASE_URL=sqlite:///./softibridge_beta.db`
- rerun `scripts\\verify_beta_local.bat`

## 6) Exit criteria
- Backend starts on PostgreSQL without migration/runtime errors
- Smoke test PASS on PostgreSQL
- No P0 issues opened by DB switch
