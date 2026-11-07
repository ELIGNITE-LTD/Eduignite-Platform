import re
import uuid as _uuid

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.users.matricules import generate_school_user_matricule


User = get_user_model()


def normalize_contact_value(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return ""
    return f"+{digits}" if raw.startswith("+") else digits


def generate_parent_matricule(school) -> str:
    return generate_school_user_matricule(school, "PARENT")


def generate_placeholder_parent_email(matricule: str) -> str:
    email = f"{matricule.lower()}@parents.eduignite.local"
    while User.objects.filter(email=email).exists():
        email = f"{matricule.lower()}.{_uuid.uuid4().hex[:4]}@parents.eduignite.local"
    return email


def get_or_create_parent_account(*, school, name: str, email: str = "", phone: str = "", whatsapp: str = ""):
    name = (name or "").strip()
    email = (email or "").strip().lower()
    phone = normalize_contact_value(phone)
    whatsapp = normalize_contact_value(whatsapp)

    if not name:
        raise serializers.ValidationError({"parent_name": "Parent name is required."})

    def validate_existing(existing_user: User, field_name: str):
        if existing_user.role != "PARENT":
            raise serializers.ValidationError({field_name: "This contact belongs to a non-parent account."})
        if school and existing_user.school_id and existing_user.school_id != school.id:
            raise serializers.ValidationError({field_name: "This parent account belongs to a different school."})
        return existing_user

    if email:
        existing = User.objects.filter(email__iexact=email).first()
        if existing:
            return validate_existing(existing, "parent_email"), False

    if phone:
        existing = User.objects.filter(phone=phone).first()
        if existing:
            return validate_existing(existing, "parent_phone"), False

    if whatsapp:
        existing = User.objects.filter(whatsapp=whatsapp).first()
        if existing:
            return validate_existing(existing, "parent_whatsapp"), False

    matricule = generate_parent_matricule(school)
    resolved_email = email or generate_placeholder_parent_email(matricule)
    parent = User.objects.create_user(
        matricule=matricule,
        name=name,
        email=resolved_email,
        phone=phone or None,
        whatsapp=whatsapp or None,
        role="PARENT",
        school=school,
        password="!pending_activation",
    )
    return parent, True


def _relationship_value(choices, value: str, fallback: str) -> str:
    return value if value in dict(choices) else fallback


def _bool_value(value, default=False) -> bool:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes", "on"}


def sync_parent_student_relationship(
    *,
    student,
    parent,
    relationship: str = "legal_guardian",
    is_primary=False,
    can_pickup=True,
    emergency_contact=False,
):
    """Keep legacy parent links and the Guardian M2M link in sync."""
    from .models import Guardian, ParentStudentLink, StudentGuardian

    if parent.role != "PARENT":
        raise serializers.ValidationError({"parent_id": "Selected user is not a parent account."})

    if parent.school_id and student.school_id and parent.school_id != student.school_id:
        raise serializers.ValidationError({"parent_id": "Selected parent belongs to a different school."})

    if not parent.school_id:
        parent.school = student.school
        parent.save(update_fields=["school"])

    existing_guardian = Guardian.objects.filter(user=parent).first()
    parent_phone = normalize_contact_value(parent.phone or "")
    student_phone = normalize_contact_value(getattr(student, "guardian_phone", "") or "")
    parent_whatsapp = normalize_contact_value(parent.whatsapp or "")
    student_whatsapp = normalize_contact_value(getattr(student, "guardian_whatsapp", "") or "")

    guardian, _ = Guardian.objects.update_or_create(
        user=parent,
        defaults={
            "name": parent.get_full_name() or parent.name or student.display_name or "Parent",
            "phone": parent_phone or student_phone or (existing_guardian.phone if existing_guardian else ""),
            "whatsapp": parent_whatsapp or student_whatsapp or (existing_guardian.whatsapp if existing_guardian else ""),
            "email": parent.email or (existing_guardian.email if existing_guardian else ""),
            "national_id": existing_guardian.national_id if existing_guardian else "",
            "occupation": existing_guardian.occupation if existing_guardian else "",
        },
    )

    guardian_relationship = _relationship_value(
        Guardian.RELATIONSHIP_CHOICES,
        relationship,
        "legal_guardian",
    )
    parent_relationship = _relationship_value(
        ParentStudentLink.RELATIONSHIP_CHOICES,
        relationship,
        "guardian",
    )
    resolved_is_primary = _bool_value(is_primary)

    guardian_link, _ = StudentGuardian.objects.update_or_create(
        student=student,
        guardian=guardian,
        defaults={
            "relationship": guardian_relationship,
            "is_primary": resolved_is_primary,
            "can_pickup": _bool_value(can_pickup, True),
            "emergency_contact": _bool_value(emergency_contact),
        },
    )

    if resolved_is_primary:
        ParentStudentLink.objects.filter(student=student, is_primary=True).exclude(parent=parent).update(is_primary=False)

    parent_link, _ = ParentStudentLink.objects.update_or_create(
        parent=parent,
        student=student,
        defaults={
            "relationship": parent_relationship,
            "is_primary": resolved_is_primary,
        },
    )

    return guardian, guardian_link, parent_link
