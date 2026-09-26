"""The code a person shares when they tell another school about EduIgnite.

Deliberately not the matricule. That is what people sign in with, so putting
it in a link that gets forwarded around WhatsApp would hand out half of
someone's credentials and let anyone confirm which accounts exist. This is a
separate, meaningless string that identifies nothing on its own: the worst
anyone can do with a stolen referral code is credit the wrong person with a
school they did not introduce.

The alphabet leaves out the characters people confuse when a code is read
aloud or written down - O and 0, I and 1, S and 5 - because these get dictated
over the phone.
"""

import secrets

from django.db import IntegrityError, transaction

ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY2346789'
CODE_LENGTH = 8
# Enough attempts that a collision is a non-event; at this length and
# alphabet the first one almost always succeeds.
MAX_ATTEMPTS = 8


def generate_code() -> str:
    return ''.join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))


def get_or_create_referral_code(user) -> str:
    """This person's code, made the first time they ask for it.

    Codes are not handed out at sign-up, because most accounts will never
    share one and an unused code is a row of noise on every user.
    """
    if getattr(user, 'referral_code', None):
        return user.referral_code

    for _ in range(MAX_ATTEMPTS):
        code = generate_code()
        try:
            with transaction.atomic():
                user.referral_code = code
                user.save(update_fields=['referral_code'])
            return code
        except IntegrityError:
            # Taken. Try another one.
            user.referral_code = None
            continue

    raise RuntimeError('Could not allocate a referral code.')


def resolve_referrer(code):
    """The person a code belongs to, or None if it belongs to nobody.

    A code that matches nobody is not an error. Links get mistyped, forwarded
    years later and copied by hand; the request is still a school that wants
    EduIgnite, and it is recorded either way.
    """
    from django.contrib.auth import get_user_model

    cleaned = (code or '').strip().upper()
    if not cleaned:
        return None

    User = get_user_model()
    return User.objects.filter(referral_code=cleaned).first()
