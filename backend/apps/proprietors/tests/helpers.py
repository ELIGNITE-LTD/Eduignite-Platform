from django.contrib.auth import get_user_model

from apps.proprietors.models import ProprietorSchoolLink
from apps.schools.models import School

User = get_user_model()
SEND = 'core.email_service.send_transactional_email'
PASSWORD = 'Passw0rd!123'


def make_school(code, name, *, category='secondary', **extra):
    return School.objects.create(
        id=code, name=name, short_name=code, principal=f'{name} Head', location='Buea',
        email=f'{code.lower()}@example.org', phone='237650000000', education_category=category,
        status='Active', **extra,
    )


def make_user(matricule, role, school=None, email=None, password=PASSWORD, **extra):
    return User.objects.create_user(
        matricule=matricule, name=f'{role} {matricule}', email=email or f'{matricule.lower()}@gmail.com',
        role=role, school=school, password=password, is_license_paid=True, **extra,
    )


def make_proprietor(matricule, schools=(), **extra):
    extra.setdefault('must_change_password', False)
    user = make_user(matricule, 'PROPRIETOR', **extra)
    for school in schools:
        ProprietorSchoolLink.objects.create(proprietor=user, school=school)
    return user
