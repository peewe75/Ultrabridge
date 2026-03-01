import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Download, DownloadLog, Invoice
from app.services.files import verify_download_signature

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/download/{download_id}")
def signed_download(
    download_id: str,
    client_id: str = Query(...),
    exp: int = Query(...),
    sig: str = Query(...),
    request: Request = None,
    db: Session = Depends(get_db),
):
    if not verify_download_signature(download_id, client_id, exp, sig):
        raise HTTPException(status_code=403, detail="Link download non valido o scaduto")
    row = db.query(Download).filter(Download.id == download_id, Download.active.is_(True)).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="File non trovato")
    if not os.path.exists(row.storage_path):
        raise HTTPException(status_code=404, detail="File fisico mancante")

    db.add(DownloadLog(
        id=str(uuid.uuid4()),
        client_id=client_id,
        download_id=download_id,
        ip=(request.client.host if request and request.client else None),
        user_agent=request.headers.get("user-agent") if request else None,
        downloaded_at=datetime.now(timezone.utc),
    ))
    db.commit()
    return FileResponse(row.storage_path, filename=row.file_name)


@router.get("/invoice/{invoice_number}")
def invoice_file(invoice_number: str, db: Session = Depends(get_db)):
    row = db.query(Invoice).filter(Invoice.invoice_number == invoice_number).one_or_none()
    if not row or not row.pdf_path:
        raise HTTPException(status_code=404, detail="Fattura non trovata")
    if not os.path.exists(row.pdf_path):
        raise HTTPException(status_code=404, detail="PDF fattura mancante")
    return FileResponse(row.pdf_path, filename=f"{invoice_number}.pdf")


@router.get("/proof/{proof_name}")
def manual_payment_proof_file(proof_name: str):
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", proof_name)
    if safe != proof_name:
        raise HTTPException(status_code=400, detail="Nome file non valido")
    path = os.path.join(get_settings().manual_payment_proofs_dir, safe)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Ricevuta non trovata")
    return FileResponse(path, filename=safe)
