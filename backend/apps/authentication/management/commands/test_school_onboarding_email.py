import uuid

from django.core.management.base import BaseCommand, CommandError

from apps.schools.models import School
from core.email_service import (
    build_school_onboarding_attachments,
    send_school_onboarding_email,
    send_transactional_email,
)


class Command(BaseCommand):
    help = "Send a school onboarding email with the two PDF attachments."

    def add_arguments(self, parser):
        parser.add_argument("school", help="School id or matricule")
        parser.add_argument(
            "--to",
            default="",
            help="Optional override recipient email for testing. Defaults to the school email.",
        )

    def handle(self, *args, **options):
        identifier = options["school"]
        school = School.objects.filter(matricule=identifier).first()
        if school is None:
            try:
                school = School.objects.filter(id=uuid.UUID(identifier)).first()
            except (TypeError, ValueError):
                school = None
        if school is None:
            raise CommandError(f"School not found for id/matricule: {identifier}")

        override_email = (options.get("to") or "").strip()
        if override_email:
            attachments = build_school_onboarding_attachments(school)
            sent = send_transactional_email(
                to_email=override_email,
                to_name=school.principal or school.name,
                subject=f"Welcome to EduIgnite - {school.name} is ready",
                html=(
                    f"<p>Welcome to EduIgnite. The onboarding documents for "
                    f"<strong>{school.name}</strong> are attached.</p>"
                ),
                text=f"Welcome to EduIgnite. The onboarding documents for {school.name} are attached.",
                sender_name="EduIgnite Founder Office",
                attachments=attachments,
            )
        else:
            sent = send_school_onboarding_email(school)

        if not sent:
            raise CommandError("School onboarding email was not accepted by the provider.")
        self.stdout.write(self.style.SUCCESS(f"School onboarding email accepted for {school.name}"))
