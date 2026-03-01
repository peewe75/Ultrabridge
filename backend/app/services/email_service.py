from __future__ import annotations

import mimetypes
import os
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from app.config import get_settings


class EmailServiceError(RuntimeError):
    pass


@dataclass
class EmailSendResult:
    ok: bool
    simulated: bool
    detail: dict


def email_enabled() -> bool:
    s = get_settings()
    return bool(s.smtp_host and s.smtp_from_email)


def send_email(
    *,
    to_email: str,
    subject: str,
    body_text: str,
    attachments: list[str] | None = None,
) -> EmailSendResult:
    s = get_settings()
    if not email_enabled():
        return EmailSendResult(
            ok=True,
            simulated=True,
            detail={"to": to_email, "subject": subject, "reason": "SMTP non configurato"},
        )

    msg = EmailMessage()
    from_display = s.smtp_from_name or "SoftiBridge"
    msg["From"] = f"{from_display} <{s.smtp_from_email}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body_text)

    for path in (attachments or []):
        if not path or not os.path.exists(path):
            continue
        ctype, _ = mimetypes.guess_type(path)
        maintype, subtype = (ctype.split("/", 1) if ctype and "/" in ctype else ("application", "octet-stream"))
        with open(path, "rb") as f:
            msg.add_attachment(f.read(), maintype=maintype, subtype=subtype, filename=os.path.basename(path))

    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
            if s.smtp_use_tls:
                smtp.starttls()
            if s.smtp_user:
                smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)
    except Exception as exc:
        raise EmailServiceError(str(exc)) from exc

    return EmailSendResult(ok=True, simulated=False, detail={"to": to_email, "subject": subject})
