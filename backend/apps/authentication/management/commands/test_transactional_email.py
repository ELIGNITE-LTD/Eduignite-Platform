from django.core.management.base import BaseCommand, CommandError

from core.email_service import EmailEvent, send_transactional_email


class Command(BaseCommand):
    help = "Send a Brevo-backed transactional test email."

    def add_arguments(self, parser):
        parser.add_argument("email", help="Recipient email address to test")
        parser.add_argument(
            "--name",
            default="EduIgnite Operator",
            help="Recipient display name",
        )

    def handle(self, *args, **options):
        email = options["email"]
        name = options["name"]
        sent = send_transactional_email(
            event=EmailEvent.OPERATOR_TEST,
            to_email=email,
            to_name=name,
            subject="EduIgnite transactional email test",
            html="""
            <div style="font-family:Arial,Helvetica,sans-serif;background:#eef4f8;padding:24px;">
              <div style="max-width:620px;margin:auto;background:#fff;border:1px solid #dce7f0;border-radius:18px;overflow:hidden;">
                <div style="background:#0b3a73;color:#fff;padding:24px;">
                  <div style="font-size:12px;text-transform:uppercase;letter-spacing:.18em;">EduIgnite</div>
                  <h1 style="margin:8px 0 0;font-size:24px;">Transactional Email Test</h1>
                </div>
                <div style="padding:26px;color:#10233f;line-height:1.7;">
                  <p>This confirms that EduIgnite can send transactional emails through Brevo.</p>
                  <p>If you received this message, the provider API key and sender configuration are working.</p>
                </div>
              </div>
            </div>
            """,
            text="This confirms EduIgnite can send transactional emails through Brevo.",
            sender_name="EduIgnite",
        )
        if not sent:
            raise CommandError(
                "Email was not accepted by the provider. Check eduignite.service logs for the Brevo error."
            )
        self.stdout.write(self.style.SUCCESS(f"Test email accepted by provider for {email}"))
