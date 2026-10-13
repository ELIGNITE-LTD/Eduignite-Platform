"""Partner-programme emails. Each is a thin wrapper over the shared branded
transactional sender, so partners get the same look as every other EduIgnite
email and the send policy stays in one place."""

import logging

from core.email_service import EmailEvent, _button, _layout, send_transactional_email

logger = logging.getLogger(__name__)
BRAND = "EduIgnite Partners"


def _send(event, to_email, to_name, subject, heading, body_html, text):
    html = _layout(subject, heading, body_html, BRAND)
    try:
        return send_transactional_email(
            event=event, to_email=to_email, to_name=to_name,
            subject=subject, html=html, text=text, sender_name=BRAND,
        )
    except Exception:  # noqa: BLE001 — email must never break the business action
        logger.exception("Partner email failed: %s to %s", event, to_email)
        return False


def application_submitted(app):
    body = (
        f"<p>Hello {app.full_name},</p>"
        f"<p>Thank you for applying to partner with EduIgnite as a "
        f"<strong>{app.partner_type_name or 'partner'}</strong>. Your application has been "
        f"received and is now under review by our team.</p>"
        f"<p>We will be in touch with the outcome. No account has been created yet — "
        f"that happens only once your application is approved.</p>"
    )
    text = (
        f"Hello {app.full_name},\n\nThank you for applying to partner with EduIgnite. "
        f"Your application is under review. We will contact you with the outcome.\n"
    )
    return _send(EmailEvent.PARTNER_APPLICATION_SUBMITTED, app.email, app.full_name,
                 "We received your EduIgnite partner application", "Application received", body, text)


def more_info_requested(app, message):
    body = (
        f"<p>Hello {app.full_name},</p>"
        f"<p>We are reviewing your EduIgnite partner application and need a little more "
        f"information before we can proceed:</p>"
        f"<blockquote style='margin:16px 0;padding:12px 16px;border-left:3px solid #67D0E4;"
        f"background:#f3f9fd;color:#334'>{message}</blockquote>"
        f"<p>Please reply to this email with the details and we will continue the review.</p>"
    )
    text = f"Hello {app.full_name},\n\nWe need more information on your partner application:\n\n{message}\n\nPlease reply with the details.\n"
    return _send(EmailEvent.PARTNER_MORE_INFO, app.email, app.full_name,
                 "More information needed — EduIgnite partner application", "More information needed", body, text)


def application_approved(app, create_url):
    body = (
        f"<p>Hello {app.full_name},</p>"
        f"<p>Great news — your EduIgnite partner application has been <strong>approved</strong>.</p>"
        f"<p>The final step is to create your secure Partner account. Use the button below; "
        f"the link is unique to you and expires in 7 days.</p>"
        f"{_button('Create Partner Account', create_url, '#264D73')}"
        f"<p style='color:#667;font-size:13px'>If the button does not work, copy this link into your browser:<br>"
        f"<span style='word-break:break-all'>{create_url}</span></p>"
    )
    text = (
        f"Hello {app.full_name},\n\nYour EduIgnite partner application has been approved. "
        f"Create your Partner account here (link expires in 7 days):\n{create_url}\n"
    )
    return _send(EmailEvent.PARTNER_APPROVED, app.email, app.full_name,
                 "Your EduIgnite partner application is approved", "Application approved", body, text)


def application_rejected(app, message):
    reason = f"<blockquote style='margin:16px 0;padding:12px 16px;border-left:3px solid #e5e7eb;background:#f8fafc;color:#334'>{message}</blockquote>" if message else ""
    body = (
        f"<p>Hello {app.full_name},</p>"
        f"<p>Thank you for your interest in partnering with EduIgnite. After review, we are "
        f"not able to move forward with your application at this time.</p>{reason}"
        f"<p>We appreciate the time you took to apply.</p>"
    )
    text = f"Hello {app.full_name},\n\nAfter review, we are not able to proceed with your partner application at this time.\n{message or ''}\n"
    return _send(EmailEvent.PARTNER_REJECTED, app.email, app.full_name,
                 "Update on your EduIgnite partner application", "Application update", body, text)


def account_created(partner):
    base_body = (
        f"<p>Hello {partner.display_name},</p>"
        f"<p>Your EduIgnite Partner account is now active. You can sign in any time to find your "
        f"referral link, track the schools you introduce, and see your impact.</p>"
    )
    text = f"Hello {partner.display_name},\n\nYour EduIgnite Partner account is active. Sign in to your partner portal to get your referral link and track your impact.\n"
    return _send(EmailEvent.PARTNER_ACCOUNT_CREATED, partner.user.email, partner.display_name,
                 "Your EduIgnite Partner account is ready", "Welcome, partner", base_body, text)


def account_suspended(partner):
    body = (
        f"<p>Hello {partner.display_name},</p>"
        f"<p>Your EduIgnite Partner account has been suspended. Your records are kept safe, but "
        f"access to the partner portal is paused. Please contact us if you believe this is in error.</p>"
    )
    text = f"Hello {partner.display_name},\n\nYour EduIgnite Partner account has been suspended. Contact us if you have questions.\n"
    return _send(EmailEvent.PARTNER_SUSPENDED, partner.user.email, partner.display_name,
                 "Your EduIgnite Partner account is suspended", "Account suspended", body, text)


def account_reactivated(partner):
    body = (
        f"<p>Hello {partner.display_name},</p>"
        f"<p>Good news — your EduIgnite Partner account has been reactivated. You can sign in again now.</p>"
    )
    text = f"Hello {partner.display_name},\n\nYour EduIgnite Partner account has been reactivated. You can sign in again.\n"
    return _send(EmailEvent.PARTNER_REACTIVATED, partner.user.email, partner.display_name,
                 "Your EduIgnite Partner account is active again", "Account reactivated", body, text)


def inactivity_warning(partner, deadline, final=False):
    event = EmailEvent.PARTNER_FINAL_WARNING if final else EmailEvent.PARTNER_INACTIVITY_WARNING
    when = deadline.strftime("%d %B %Y") if deadline else "soon"
    urgency = "final reminder" if final else "reminder"
    body = (
        f"<p>Hello {partner.display_name},</p>"
        f"<p>This is a {urgency}: your EduIgnite Partner account was created but has not been used yet. "
        f"Unused accounts are removed on <strong>{when}</strong>.</p>"
        f"<p>Simply sign in to keep your account — signing in and using your referral link stops the countdown.</p>"
        f"{_button('Sign in to keep my account', 'https://eduignite.online/partners/login', '#264D73')}"
    )
    text = f"Hello {partner.display_name},\n\nYour unused EduIgnite Partner account will be removed on {when}. Sign in to keep it: https://eduignite.online/partners/login\n"
    return _send(event, partner.user.email, partner.display_name,
                 "Action needed to keep your EduIgnite Partner account", "Keep your account", body, text)


def password_reset(partner, reset_url):
    body = (
        f"<p>Hello {partner.display_name},</p>"
        f"<p>We received a request to reset your EduIgnite Partner password. Use the button below "
        f"to choose a new one. If you did not request this, you can ignore this email.</p>"
        f"{_button('Reset my password', reset_url, '#264D73')}"
        f"<p style='color:#667;font-size:13px;word-break:break-all'>{reset_url}</p>"
    )
    text = f"Hello {partner.display_name},\n\nReset your EduIgnite Partner password here:\n{reset_url}\n"
    return _send(EmailEvent.PARTNER_PASSWORD_RESET, partner.user.email, partner.display_name,
                 "Reset your EduIgnite Partner password", "Password reset", body, text)
