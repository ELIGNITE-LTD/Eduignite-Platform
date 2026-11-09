"""Transactional email for EduIgnite, and the policy on when email is allowed.

Email costs money, so EduIgnite sends it for a short, fixed list of events and
nothing else. That list is ``APPROVED_EMAIL_EVENTS`` below:

    School created (to the school's official email)               SCHOOL_CREATED
    Staff account created for a school                             STAFF_ACCOUNT_CREATED
    EduIgnite executive account created by the CEO Office          EXECUTIVE_ACCOUNT_CREATED
    Forgot password: staff, principals, executives (never students) PASSWORD_RESET
    Forgot password: EduIgnite Academy learners                    PASSWORD_RESET
    Provider check run by hand with a management command           OPERATOR_TEST

Every email goes through ``send_transactional_email``, which refuses any event
not on that list. There is deliberately no other way to reach the provider, so
a new feature cannot start sending email by accident: it has to add an event
here, in review.

Email is separate from notifications. In-app, push, desktop and mobile
notifications live in ``apps.notifications`` and are never gated by this
module: an event that should not email still notifies exactly as before.

Brevo is the provider (long-running free transactional tier, simple HTTP API);
the API key stays backend-only.
"""

from __future__ import annotations

import base64
import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import Iterable

import requests
from django.conf import settings
from django.utils import timezone
from django.utils.html import escape

logger = logging.getLogger(__name__)


LOCAL_EMAIL_SUFFIXES = (".eduignite.local", "@example.com")
PDF_PAGE_WIDTH = 595
PDF_PAGE_HEIGHT = 842
PDF_MARGIN = 48
PDF_LINE_HEIGHT = 15


class EmailEvent(str, Enum):
    SCHOOL_CREATED = "school_created"
    STAFF_ACCOUNT_CREATED = "staff_account_created"
    EXECUTIVE_ACCOUNT_CREATED = "executive_account_created"
    PASSWORD_RESET = "password_reset"
    # School account requests (see apps.orders.notifications): to the
    # executives, the acknowledgement to the requester, and the account/school
    # activated message. Never carries a password.
    SCHOOL_REQUEST_RECEIVED = "school_request_received"
    SCHOOL_REQUEST_ACK = "school_request_ack"
    SCHOOL_ACCOUNT_ACTIVATED = "school_account_activated"
    # Partner programme (see apps.partners).
    PARTNER_APPLICATION_SUBMITTED = "partner_application_submitted"
    PARTNER_MORE_INFO = "partner_more_info"
    PARTNER_APPROVED = "partner_approved"
    PARTNER_REJECTED = "partner_rejected"
    PARTNER_ACCOUNT_CREATED = "partner_account_created"
    PARTNER_SUSPENDED = "partner_suspended"
    PARTNER_REACTIVATED = "partner_reactivated"
    PARTNER_INACTIVITY_WARNING = "partner_inactivity_warning"
    PARTNER_FINAL_WARNING = "partner_final_warning"
    PARTNER_PASSWORD_RESET = "partner_password_reset"
    # School admission applications (see apps.schools.admissions_services): a
    # notice to the school and an acknowledgement to the guardian. Never carries
    # a password or any document.
    ADMISSION_RECEIVED = "admission_received"
    ADMISSION_ACK = "admission_ack"
    # Proprietor accounts (see apps.proprietors). Informational only; neither
    # ever carries a password.
    PROPRIETOR_ACCOUNT_CREATED = "proprietor_account_created"
    ADMIN_CREDENTIALS_CHANGED = "admin_credentials_changed"
    # Customer Care replies written by an executive (see apps.customer_care).
    CUSTOMER_CARE_REPLY = "customer_care_reply"
    # Notice to a school's administrators when staff act on its public website
    # (block, unblock, new steps); see apps.site_oversight.notifications.
    SITE_OVERSIGHT_NOTICE = "site_oversight_notice"
    # Sent only by the test_*_email management commands, run by hand from the
    # server shell to check the provider. The app itself never uses it.
    OPERATOR_TEST = "operator_test"


# The only events that may send email. Adding to this set is a product
# decision about cost, not a code convenience.
APPROVED_EMAIL_EVENTS = frozenset(EmailEvent)

CEO_OFFICE_SENDER = "CEO Office - ELIGNITE / EduIgnite"

# Roles that never receive account emails: students recover through their
# principal; parents and academy learners are not school staff.
NON_STAFF_ROLES = frozenset({"STUDENT", "PARENT", "ACADEMY_LEARNER"})


@dataclass(frozen=True)
class EmailAttachment:
    filename: str
    content: bytes
    content_type: str = "application/pdf"


def _is_deliverable_email(email: str | None) -> bool:
    value = (email or "").strip().lower()
    if not value or "@" not in value:
        return False
    return not any(value.endswith(suffix) for suffix in LOCAL_EMAIL_SUFFIXES)


def _front_end_url(path: str = "") -> str:
    base = getattr(settings, "FRONTEND_URL", "https://eduignite.online").rstrip("/")
    return f"{base}/{path.lstrip('/')}" if path else base


def _render_pdf(html: str) -> bytes:
    from weasyprint import HTML

    return HTML(string=html, base_url=_front_end_url()).write_pdf()


def _escape_pdf_text(value: str | None) -> str:
    return (
        str(value or "")
        .replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )


def _wrap_pdf_text(value: str | None, max_chars: int = 82) -> list[str]:
    words = re.sub(r"\s+", " ", str(value or "Not provided").strip()).split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > max_chars and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or ["Not provided"]


def _pdf_text(x: int, y: int, text: str, font: str = "F1", size: int = 10, color: str = "0 0 0") -> str:
    return f"{color} rg BT /{font} {size} Tf {x} {y} Td ({_escape_pdf_text(text)}) Tj ET"


def _simple_document_pdf(
    *,
    title: str,
    subtitle: str,
    rows: list[tuple[str, str | None]],
    issuer: str,
) -> bytes:
    """Generate a valid A4 PDF without external binary dependencies."""

    pages: list[list[str]] = []
    commands: list[str] = []
    y = PDF_PAGE_HEIGHT - PDF_MARGIN

    def start_page() -> None:
        nonlocal commands, y
        if commands:
            pages.append(commands)
        commands = []
        y = PDF_PAGE_HEIGHT - PDF_MARGIN
        commands.extend(
            [
                "0.043 0.227 0.451 rg",
                f"{PDF_MARGIN} {y - 62} {PDF_PAGE_WIDTH - (PDF_MARGIN * 2)} 62 re f",
                _pdf_text(PDF_MARGIN + 18, y - 28, issuer.upper(), "F2", 9, "1 1 1"),
                _pdf_text(PDF_MARGIN + 18, y - 50, title, "F2", 18, "1 1 1"),
                _pdf_text(PDF_MARGIN + 18, y - 80, subtitle, "F1", 9, "0.25 0.35 0.45"),
                "0.85 0.72 0.36 rg",
                f"{PDF_MARGIN} {y - 92} {PDF_PAGE_WIDTH - (PDF_MARGIN * 2)} 2 re f",
            ]
        )
        y -= 122

    def ensure_space(height: int) -> None:
        nonlocal y
        if y - height < PDF_MARGIN + 34:
            commands.append(_pdf_text(PDF_MARGIN, 28, f"Generated by EduIgnite - {timezone.now().strftime('%d %B %Y')}", "F1", 8, "0.35 0.45 0.55"))
            start_page()

    start_page()
    for index, (label, value) in enumerate(rows):
        value_lines = _wrap_pdf_text(value, 62)
        row_height = max(32, 18 + len(value_lines) * PDF_LINE_HEIGHT)
        ensure_space(row_height)
        background = "0.96 0.98 1 rg" if index % 2 == 0 else "1 1 1 rg"
        commands.extend(
            [
                background,
                f"{PDF_MARGIN} {y - row_height + 8} {PDF_PAGE_WIDTH - (PDF_MARGIN * 2)} {row_height} re f",
                "0.043 0.227 0.451 rg",
                f"{PDF_MARGIN} {y - row_height + 8} 150 {row_height} re f",
                _pdf_text(PDF_MARGIN + 12, y - 12, label.upper()[:34], "F2", 9, "1 1 1"),
            ]
        )
        text_y = y - 12
        for line in value_lines:
            commands.append(_pdf_text(PDF_MARGIN + 168, text_y, line[:100], "F1", 9, "0.06 0.14 0.25"))
            text_y -= PDF_LINE_HEIGHT
        y -= row_height

    commands.append(_pdf_text(PDF_MARGIN, 28, f"Generated by EduIgnite - {timezone.now().strftime('%d %B %Y')}", "F1", 8, "0.35 0.45 0.55"))
    pages.append(commands)

    objects: list[str] = []

    def add_object(payload: str) -> int:
        objects.append(payload)
        return len(objects)

    font_regular_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    font_bold_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    page_ids: list[int] = []

    for page_commands in pages:
        stream = "\n".join(page_commands)
        stream_bytes = stream.encode("latin-1", errors="replace")
        content_id = add_object(f"<< /Length {len(stream_bytes)} >>\nstream\n{stream}\nendstream")
        page_ids.append(
            add_object(
                "<< /Type /Page /Parent {pages} 0 R "
                f"/MediaBox [0 0 {PDF_PAGE_WIDTH} {PDF_PAGE_HEIGHT}] "
                f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >> >> "
                f"/Contents {content_id} 0 R >>"
            )
        )

    pages_id = add_object(
        "<< /Type /Pages /Kids ["
        + " ".join(f"{page_id} 0 R" for page_id in page_ids)
        + f"] /Count {len(page_ids)} >>"
    )
    catalog_id = add_object(f"<< /Type /Catalog /Pages {pages_id} 0 R >>")

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for object_id, payload in enumerate(objects, start=1):
        if "{pages}" in payload:
            payload = payload.format(pages=pages_id)
        offsets.append(len(pdf))
        pdf.extend(f"{object_id} 0 obj\n".encode("latin-1"))
        pdf.extend(payload.encode("latin-1", errors="replace"))
        pdf.extend(b"\nendobj\n")

    xref_start = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))
    pdf.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF"
        ).encode("latin-1")
    )
    return bytes(pdf)


def _render_document_pdf(title: str, subtitle: str, rows: list[tuple[str, str | None]], issuer: str) -> bytes:
    html = _document_html(title=title, subtitle=subtitle, rows=rows, issuer=issuer)
    try:
        return _render_pdf(html)
    except Exception as exc:  # pragma: no cover - depends on server PDF libraries
        logger.warning("WeasyPrint document rendering failed; using built-in PDF fallback. title=%s error=%s", title, exc)
        return _simple_document_pdf(title=title, subtitle=subtitle, rows=rows, issuer=issuer)


def _safe_sender_name(name: str | None, fallback: str) -> str:
    cleaned = re.sub(r"\s+", " ", (name or "").strip())
    return cleaned[:70] or fallback


def _brevo_payload(
    *,
    to_email: str,
    to_name: str,
    subject: str,
    html: str,
    text: str,
    sender_name: str,
    reply_to_email: str | None = None,
    attachments: Iterable[EmailAttachment] | None = None,
) -> dict:
    from_email = getattr(settings, "EMAIL_FROM_ADDRESS", "") or getattr(settings, "SERVER_EMAIL", "")
    sender = {
        "name": _safe_sender_name(sender_name, getattr(settings, "EMAIL_FROM_NAME", "EduIgnite")),
        "email": from_email,
    }
    payload = {
        "sender": sender,
        "to": [{"email": to_email, "name": to_name or to_email}],
        "subject": subject,
        "htmlContent": html,
        "textContent": text,
    }
    if reply_to_email and _is_deliverable_email(reply_to_email):
        payload["replyTo"] = {"email": reply_to_email, "name": sender["name"]}

    encoded_attachments = []
    for attachment in attachments or []:
        encoded_attachments.append(
            {
                "name": attachment.filename,
                "content": base64.b64encode(attachment.content).decode("ascii"),
            }
        )
    if encoded_attachments:
        payload["attachment"] = encoded_attachments
    return payload


def send_transactional_email(
    *,
    event: EmailEvent,
    to_email: str,
    to_name: str,
    subject: str,
    html: str,
    text: str,
    sender_name: str = "EduIgnite",
    reply_to_email: str | None = None,
    attachments: Iterable[EmailAttachment] | None = None,
) -> bool:
    """Send a branded transactional email via Brevo, only for an approved event.

    Missing provider configuration is treated as a non-fatal operational issue:
    the business action succeeds, and the server logs what would have been sent.
    """

    if not isinstance(event, EmailEvent) or event not in APPROVED_EMAIL_EVENTS:
        logger.info("Email blocked by policy: event=%s subject=%s", event, subject)
        return False

    attachment_list = list(attachments or [])

    if not _is_deliverable_email(to_email):
        logger.info("Skipped transactional email to non-deliverable address: %s", to_email)
        return False

    provider = getattr(settings, "EMAIL_PROVIDER", "brevo").lower()
    # Dashboard-editable (runtime_config), env as fallback.
    try:
        from apps.platform import runtime_config
        api_key = runtime_config.brevo_api_key()
    except Exception:
        api_key = getattr(settings, "BREVO_API_KEY", "")
    if provider != "brevo" or not api_key:
        logger.warning(
            "Transactional email not sent because Brevo is not configured. subject=%s to=%s",
            subject,
            to_email,
        )
        return False

    payload = _brevo_payload(
        to_email=to_email,
        to_name=to_name,
        subject=subject,
        html=html,
        text=text,
        sender_name=sender_name,
        reply_to_email=reply_to_email,
        attachments=attachment_list,
    )
    endpoint = getattr(settings, "BREVO_API_URL", "https://api.brevo.com/v3/smtp/email")
    try:
        response = requests.post(
            endpoint,
            json=payload,
            headers={
                "api-key": api_key,
                "accept": "application/json",
                "content-type": "application/json",
            },
            timeout=getattr(settings, "EMAIL_PROVIDER_TIMEOUT_SECONDS", 12),
        )
        if response.status_code >= 400:
            logger.warning("Brevo email failed: %s %s", response.status_code, response.text[:800])
            return False
        logger.info(
            "Brevo email accepted by provider. subject=%s to=%s attachments=%s",
            subject,
            to_email,
            len(attachment_list),
        )
        return True
    except requests.RequestException as exc:
        logger.warning("Brevo email request failed: %s", exc)
        return False


def _layout(title: str, preheader: str, body: str, brand_name: str, primary: str = "#0b3a73") -> str:
    return f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#eef4f8;font-family:Arial,Helvetica,sans-serif;color:#10233f;">
        <div style="display:none;max-height:0;overflow:hidden;">{escape(preheader)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f8;padding:28px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #dce7f0;box-shadow:0 18px 45px rgba(11,58,115,.10);">
                <tr>
                  <td style="background:{primary};padding:28px 32px;color:#ffffff;">
                    <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;font-weight:800;opacity:.78;">{escape(brand_name)}</div>
                    <h1 style="margin:10px 0 0;font-size:27px;line-height:1.15;">{escape(title)}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px 32px;">{body}</td>
                </tr>
                <tr>
                  <td style="padding:18px 32px;background:#f7fafc;border-top:1px solid #dce7f0;color:#60748b;font-size:12px;line-height:1.6;">
                    This is a secure transactional message generated on {timezone.now().strftime("%d %b %Y, %H:%M UTC")}.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """


def _button(label: str, url: str, color: str = "#0b3a73") -> str:
    return (
        f'<a href="{escape(url)}" style="display:inline-block;background:{color};color:#fff;'
        'text-decoration:none;padding:13px 18px;border-radius:12px;font-weight:800;'
        'font-size:13px;margin:6px 8px 6px 0;">'
        f"{escape(label)}</a>"
    )


def _school_info_rows(school) -> list[tuple[str, str | None]]:
    return [
        ("School Name", school.name),
        ("Matricule", school.matricule),
        ("Principal / School Admin", school.principal),
        ("Official Email", school.email),
        ("Phone", school.phone),
        ("Type", school.school_type),
        ("Subsystem", school.subsystem),
        ("Region", school.region),
        ("Division", school.division),
        ("Sub-Division", school.sub_division),
        ("City / Village", school.city_village),
        ("Address", school.address),
        ("Motto", school.motto),
        ("Status", school.status),
    ]


def _school_info_pdf_html(school) -> str:
    rows = _school_info_rows(school)
    return _document_html(
        title="EduIgnite School Onboarding Dossier",
        subtitle="Official institution information entered by the EduIgnite founder office",
        rows=rows,
        issuer="EduIgnite Platform Registry",
    )


def _school_info_pdf(school) -> bytes:
    return _render_document_pdf(
        title="EduIgnite School Onboarding Dossier",
        subtitle="Official institution information entered by the EduIgnite founder office",
        rows=_school_info_rows(school),
        issuer="EduIgnite Platform Registry",
    )


def _activation_guide_rows(school) -> list[tuple[str, str | None]]:
    return [
        ("1. Sign in", f"Open {_front_end_url('/login')} and use the official school email."),
        ("2. Activate account", f"Use matricule {school.matricule} when prompted, then set a secure password."),
        ("3. Verify institution profile", "Upload the school logo, banner, motto, address, and contact details."),
        ("4. Configure academics", "Open Academics > Years & Terms, generate the Cameroon secondary calendar, then verify sequences."),
        ("5. Build structure", "Review sub-schools, classes, subjects, teachers, class masters, and timetable."),
        ("6. Watch training video", "Open the Training Portal inside your dashboard for the guided onboarding video."),
        ("7. Start operations", "Register staff, students, guardians, fees, attendance, marks, report cards, and communication channels."),
    ]


def _activation_guide_pdf_html(school) -> str:
    rows = _activation_guide_rows(school)
    return _document_html(
        title="EduIgnite Account Activation & Setup Guide",
        subtitle=f"Operational setup guide for {school.name}",
        rows=rows,
        issuer="EduIgnite Implementation Desk",
    )


def _activation_guide_pdf(school) -> bytes:
    return _render_document_pdf(
        title="EduIgnite Account Activation & Setup Guide",
        subtitle=f"Operational setup guide for {school.name}",
        rows=_activation_guide_rows(school),
        issuer="EduIgnite Implementation Desk",
    )


def build_school_onboarding_attachments(school) -> list[EmailAttachment]:
    attachments = [
        EmailAttachment("eduignite-school-onboarding-dossier.pdf", _school_info_pdf(school)),
        EmailAttachment("eduignite-account-activation-guide.pdf", _activation_guide_pdf(school)),
    ]
    logger.info("Prepared %s school onboarding PDF attachments for school=%s", len(attachments), school.id)
    return attachments


def _document_html(title: str, subtitle: str, rows: list[tuple[str, str | None]], issuer: str) -> str:
    table_rows = "".join(
        f"<tr><th>{escape(label)}</th><td>{escape(str(value or 'Not provided'))}</td></tr>"
        for label, value in rows
    )
    return f"""
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page {{ size: A4; margin: 1.6cm; }}
          body {{ font-family: Helvetica, Arial, sans-serif; color:#10233f; }}
          .header {{ border:3px solid #0b3a73; border-radius:18px; padding:24px; text-align:center; }}
          .kicker {{ color:#0b3a73; text-transform:uppercase; letter-spacing:.22em; font-size:10px; font-weight:800; }}
          h1 {{ color:#0b3a73; margin:10px 0 6px; font-size:25px; }}
          .subtitle {{ color:#5b7088; font-size:13px; }}
          table {{ width:100%; border-collapse:collapse; margin-top:28px; }}
          th {{ width:34%; background:#0b3a73; color:white; text-align:left; padding:11px; font-size:11px; text-transform:uppercase; }}
          td {{ border:1px solid #d9e4ee; padding:11px; font-size:12px; }}
          tr:nth-child(even) td {{ background:#f5f9fc; }}
          .footer {{ margin-top:34px; display:flex; justify-content:space-between; color:#64748b; font-size:10px; border-top:1px solid #d9e4ee; padding-top:16px; }}
        </style>
      </head>
      <body>
        <div class="header">
          <div class="kicker">{escape(issuer)}</div>
          <h1>{escape(title)}</h1>
          <div class="subtitle">{escape(subtitle)}</div>
        </div>
        <table>{table_rows}</table>
        <div class="footer">
          <span>Generated by EduIgnite</span>
          <span>{timezone.now().strftime("%d %B %Y")}</span>
        </div>
      </body>
    </html>
    """


def _details_table(rows: list[tuple[str, str | None]]) -> str:
    cells = "".join(
        f'<tr><td style="padding:10px;border:1px solid #dce7f0;font-weight:800;width:38%;">{escape(label)}</td>'
        f'<td style="padding:10px;border:1px solid #dce7f0;">{escape(str(value))}</td></tr>'
        for label, value in rows
        if value
    )
    return f'<table style="width:100%;border-collapse:collapse;margin:20px 0;">{cells}</table>'


def _role_label(user) -> str:
    # Prefer the model's human-readable role name (e.g. "Marketing Department",
    # "Chief Operations Officer") over a title-cased code.
    display = getattr(user, "display_role", None)
    if display:
        return display
    getter = getattr(user, "get_role_display", None)
    if callable(getter):
        try:
            return getter()
        except Exception:  # noqa: BLE001
            pass
    return (getattr(user, "role", "") or "User").replace("_", " ").title()


def send_school_onboarding_email(school, principal_user=None) -> bool:
    """SCHOOL_CREATED: the one welcome email a new school receives, at its official address."""
    principal_name = getattr(principal_user, "name", None) or school.principal
    details = _details_table([
        ("School", school.name),
        ("Principal", principal_name),
        ("School admin matricule", school.matricule),
    ])
    body = f"""
      <p style="font-size:16px;line-height:1.7;margin-top:0;">Dear {escape(principal_name or school.name)},</p>
      <p style="font-size:15px;line-height:1.7;">
        Welcome to EduIgnite. <strong>{escape(school.name)}</strong> has been created on the platform.
      </p>
      {details}
      <p style="font-size:15px;line-height:1.7;">
        The attached onboarding dossier and activation guide contain the school information on record
        and the steps to activate and configure your account.
      </p>
      {_button("Open EduIgnite Login", _front_end_url("/login"))}
      <p style="font-size:13px;line-height:1.7;color:#64748b;">
        After login, open the Training Portal in your dashboard and watch the onboarding video before
        configuring classes, staff, fees, timetable, attendance, and report cards.
      </p>
    """
    return send_transactional_email(
        event=EmailEvent.SCHOOL_CREATED,
        to_email=school.email,
        to_name=principal_name or school.name,
        subject=f"Welcome to EduIgnite - {school.name} is ready",
        html=_layout("Welcome to EduIgnite", f"{school.name} has been created.", body, CEO_OFFICE_SENDER),
        text=(
            f"Welcome to EduIgnite. {school.name} has been created. Principal: {principal_name}. "
            f"School admin matricule: {school.matricule}. Login: {_front_end_url('/login')}"
        ),
        sender_name=CEO_OFFICE_SENDER,
        attachments=build_school_onboarding_attachments(school),
    )


def send_staff_account_email(user, actor=None) -> bool:
    """STAFF_ACCOUNT_CREATED: welcome a new member of a school's staff.

    Students, parents and academy learners never get this email. The password
    is never emailed: the school shares it, or the staff member sets their own
    through Forgot password, which emails a short-lived, single-use link.
    """
    school = getattr(user, "school", None)
    if not school or (getattr(user, "role", "") or "").upper() in NON_STAFF_ROLES:
        return False
    sender = f"Principal's Office - {school.name}"
    details = _details_table([
        ("Name", user.name),
        ("Matricule", user.matricule),
        ("Role", _role_label(user)),
        ("School", school.name),
    ])
    body = f"""
      <p style="font-size:16px;line-height:1.7;margin-top:0;">Dear {escape(user.name)},</p>
      <p style="font-size:15px;line-height:1.7;">
        Welcome to <strong>{escape(school.name)}</strong> on EduIgnite. Your staff account has been created.
      </p>
      {details}
      {_button("Open EduIgnite Login", _front_end_url("/login"))}
      <p style="font-size:13px;line-height:1.7;color:#64748b;">
        Sign in with your matricule and the password your school gave you, or choose
        <strong>Forgot password</strong> on the login page to set your own password by email.
      </p>
    """
    return send_transactional_email(
        event=EmailEvent.STAFF_ACCOUNT_CREATED,
        to_email=user.email,
        to_name=user.name,
        subject=f"{school.name}: your EduIgnite staff account is ready",
        html=_layout("Your Staff Account Is Ready", f"{school.name} created your account.", body, sender),
        text=(
            f"Welcome to {school.name} on EduIgnite. Matricule: {user.matricule}. "
            f"Login: {_front_end_url('/login')} (use Forgot password to set your own password)."
        ),
        sender_name=sender,
        reply_to_email=school.email,
    )


def send_executive_account_email(user, actor=None) -> bool:
    """EXECUTIVE_ACCOUNT_CREATED: welcome a new EduIgnite / ELIGNITE executive."""
    if getattr(user, "school_id", None) or not getattr(user, "is_platform_executive", False):
        return False
    profile = getattr(user, "founder_profile", None)
    rows = [
        ("Name", user.name),
        ("Matricule", user.matricule),
        ("Role", _role_label(user)),
    ]
    if profile is not None and getattr(profile, "founder_title", ""):
        rows.append(("Title", profile.founder_title))
    if getattr(user, "email", ""):
        rows.append(("Email", user.email))
    if getattr(user, "phone", ""):
        rows.append(("Phone", user.phone))
    if getattr(user, "whatsapp", "") and user.whatsapp != getattr(user, "phone", ""):
        rows.append(("WhatsApp", user.whatsapp))
    details = _details_table(rows)
    body = f"""
      <p style="font-size:16px;line-height:1.7;margin-top:0;">Dear {escape(user.name)},</p>
      <p style="font-size:15px;line-height:1.7;">
        Welcome to ELIGNITE. Your EduIgnite executive account has been created by the CEO Office.
      </p>
      {details}
      {_button("Open EduIgnite Login", _front_end_url("/login"))}
      <p style="font-size:13px;line-height:1.7;color:#64748b;">
        Sign in with your matricule and the password shared by the CEO Office, or choose
        <strong>Forgot password</strong> on the login page to set your own password by email.
      </p>
    """
    return send_transactional_email(
        event=EmailEvent.EXECUTIVE_ACCOUNT_CREATED,
        to_email=user.email,
        to_name=user.name,
        subject="ELIGNITE: your EduIgnite executive account is ready",
        html=_layout("Your Executive Account Is Ready", "The CEO Office created your account.", body, CEO_OFFICE_SENDER),
        text=f"Your EduIgnite executive account is ready. Matricule: {user.matricule}. Login: {_front_end_url('/login')}",
        sender_name=CEO_OFFICE_SENDER,
    )


def send_executive_account_updated_email(user, actor=None, *, changed=None) -> bool:
    """EXECUTIVE_ACCOUNT_CREATED: tell an executive their account details were
    updated, sent to their (possibly new) email, with the current details.

    Used when the CEO Office edits an executive from the founders tab - most
    importantly when the email itself changed, so the new address is confirmed
    and carries the up-to-date record (name, role, title, contacts).
    """
    if getattr(user, "school_id", None) or not getattr(user, "is_platform_executive", False):
        return False
    profile = getattr(user, "founder_profile", None)
    rows = [
        ("Name", user.name),
        ("Matricule", user.matricule),
        ("Role", _role_label(user)),
    ]
    if profile is not None and getattr(profile, "founder_title", ""):
        rows.append(("Title", profile.founder_title))
    if getattr(user, "email", ""):
        rows.append(("Email", user.email))
    if getattr(user, "phone", ""):
        rows.append(("Phone", user.phone))
    if getattr(user, "whatsapp", "") and user.whatsapp != getattr(user, "phone", ""):
        rows.append(("WhatsApp", user.whatsapp))
    details = _details_table(rows)
    changed_line = ""
    if changed:
        changed_line = (
            f'<p style="font-size:14px;line-height:1.7;">Updated: '
            f'<strong>{escape(", ".join(changed))}</strong>.</p>'
        )
    body = f"""
      <p style="font-size:16px;line-height:1.7;margin-top:0;">Dear {escape(user.name)},</p>
      <p style="font-size:15px;line-height:1.7;">
        Your EduIgnite executive account details were updated by the CEO Office.
        Here is your current record.
      </p>
      {changed_line}
      {details}
      {_button("Open EduIgnite Login", _front_end_url("/login"))}
      <p style="font-size:13px;line-height:1.7;color:#64748b;">
        Sign in with your matricule as usual. If anything here is wrong, contact the CEO Office.
      </p>
    """
    return send_transactional_email(
        event=EmailEvent.EXECUTIVE_ACCOUNT_CREATED,
        to_email=user.email,
        to_name=user.name,
        subject="ELIGNITE: your EduIgnite executive account details were updated",
        html=_layout("Your Executive Account Was Updated", "The CEO Office updated your account.", body, CEO_OFFICE_SENDER),
        text=f"Your EduIgnite executive account details were updated. Matricule: {user.matricule}. Login: {_front_end_url('/login')}",
        sender_name=CEO_OFFICE_SENDER,
    )


def send_account_created_email(user, actor=None) -> bool:
    """The account-creation email for whoever was just created, when their kind of account gets one."""
    if getattr(user, "school_id", None):
        return send_staff_account_email(user, actor=actor)
    return send_executive_account_email(user, actor=actor)


def send_password_reset_email(user, reset_url: str, valid_minutes: int) -> bool:
    """PASSWORD_RESET: a short-lived, single-use reset link. Never for students."""
    if (getattr(user, "role", "") or "").upper() == "STUDENT":
        return False
    user_name = user.get_full_name() or user.email
    school = getattr(user, "school", None)
    issuer = getattr(school, "name", None) or "EduIgnite"
    body = f"""
      <p style="font-size:16px;line-height:1.7;margin-top:0;">Hello <strong>{escape(user_name)}</strong>,</p>
      <p style="font-size:15px;line-height:1.7;">
        We received a request to reset the password for your EduIgnite account. Use the button below to
        set a new password. This link expires in <strong>{valid_minutes} minutes</strong> and works once.
      </p>
      {_button("Reset My Password", reset_url)}
      <p style="font-size:13px;line-height:1.7;color:#64748b;">
        If the button does not work, copy this link into your browser:<br>
        <a href="{escape(reset_url)}" style="color:#0b3a73;word-break:break-all;">{escape(reset_url)}</a>
      </p>
      <p style="font-size:13px;line-height:1.7;color:#64748b;">
        If you did not request a password reset, you can ignore this email. Your password will not change.
      </p>
    """
    return send_transactional_email(
        event=EmailEvent.PASSWORD_RESET,
        to_email=user.email,
        to_name=user_name,
        subject="EduIgnite - Password Reset Request",
        html=_layout("Password Reset Request", "Reset your EduIgnite password.", body, issuer),
        text=(
            f"Hello {user_name},\n\nWe received a request to reset your EduIgnite password. "
            f"This link is valid for {valid_minutes} minutes:\n{reset_url}\n\n"
            "If you did not request this, you can ignore this email."
        ),
        sender_name=issuer,
        reply_to_email=getattr(school, "email", None),
    )


def send_academy_password_reset_email(user, reset_url: str, valid_minutes: int) -> bool:
    """PASSWORD_RESET for an EduIgnite Academy learner, in the Academy's own design.

    The link opens the Academy's reset page; the password itself is never emailed.
    """
    if (getattr(user, "role", "") or "").upper() != "ACADEMY_LEARNER":
        return False
    name = user.get_full_name() or "Learner"
    brand = "EduIgnite Academy"
    body = f"""
      <p style="font-size:16px;line-height:1.7;margin-top:0;">Hello <strong>{escape(name)}</strong>,</p>
      <p style="font-size:15px;line-height:1.7;">
        We received a request to reset the password of your EduIgnite Academy account.
        To choose a new password:
      </p>
      <ol style="font-size:15px;line-height:1.8;padding-left:20px;margin:0 0 8px;">
        <li>Select <strong>Reset My Password</strong> below.</li>
        <li>Enter your new password twice and save it.</li>
        <li>Log in to the Academy with your email address and the new password.</li>
      </ol>
      {_button("Reset My Password", reset_url, "#264D73")}
      <p style="font-size:13px;line-height:1.7;color:#64748b;">
        This link expires in <strong>{valid_minutes} minutes</strong> and can be used once.
        Your courses, progress and certificates are not affected.
      </p>
      <p style="font-size:13px;line-height:1.7;color:#64748b;">
        If the button does not work, copy this link into your browser:<br>
        <a href="{escape(reset_url)}" style="color:#264D73;word-break:break-all;">{escape(reset_url)}</a>
      </p>
      <p style="font-size:13px;line-height:1.7;color:#64748b;">
        If you did not ask for this, you can ignore this email. Your password will not change.
      </p>
    """
    return send_transactional_email(
        event=EmailEvent.PASSWORD_RESET,
        to_email=user.email,
        to_name=name,
        subject="EduIgnite Academy - Reset your password",
        html=_layout("Reset Your Academy Password", "Reset your EduIgnite Academy password.", body, brand, "#264D73"),
        text=(
            f"Hello {name},\n\nWe received a request to reset your EduIgnite Academy password. "
            f"Open this link within {valid_minutes} minutes to choose a new one:\n{reset_url}\n\n"
            "If you did not ask for this, you can ignore this email."
        ),
        sender_name=brand,
    )
