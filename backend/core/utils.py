import re
import logging
from decimal import Decimal
from django.core.cache import cache
from django.db import models
from django.utils.text import slugify
from firebase_admin import messaging
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)
User = get_user_model()


def generate_matricule(role, school_id):
    """
    Generate a unique matricule (ID) for a user based on their role and school.
    Format: ROLE_SCHOOLID_TIMESTAMP_RANDOM
    """
    import time
    import random

    timestamp = int(time.time() * 1000)
    random_part = random.randint(1000, 9999)
    role_prefix = role[:3].upper()

    matricule = f"{role_prefix}{school_id}{timestamp}{random_part}"
    return matricule


def send_notification(user, title, message, data=None, fcm_token=None):
    """
    Send a push notification to a user via Firebase Cloud Messaging.
    """
    try:
        if not fcm_token:
            if hasattr(user, 'fcm_token') and user.fcm_token:
                fcm_token = user.fcm_token
            else:
                logger.warning(f"No FCM token available for user {user.id}")
                return False

        notification = messaging.Notification(title=title, body=message)
        message_obj = messaging.Message(
            notification=notification,
            data=data or {},
            token=fcm_token,
        )

        messaging.send(message_obj)
        logger.info(f"Notification sent to user {user.id}")
        return True

    except Exception as e:
        logger.error(f"Failed to send notification to user {user.id}: {str(e)}")
        return False


def get_school_from_request(request):
    """
    Extract school from the request context.
    Priority: URL params > query params > user school > None
    """
    school_id = (
        request.parser_context.get('kwargs', {}).get('school_id')
        or request.query_params.get('school_id')
        or (request.user.school_id if hasattr(request.user, 'school_id') else None)
    )

    if school_id:
        try:
            from apps.schools.models import School

            return School.objects.get(id=school_id)
        except Exception as e:
            logger.warning(f"Could not fetch school {school_id}: {str(e)}")
            return None

    return None


def format_currency_xaf(amount):
    """
    Format amount as XAF (Central African CFA franc) currency.
    Cameroon uses XAF as its currency.
    """
    if isinstance(amount, (int, float)):
        amount = Decimal(str(amount))

    return f"XAF {amount:,.2f}"


def parse_currency_xaf(currency_string):
    """
    Parse XAF currency string to Decimal value.
    Example: 'XAF 1,234.56' -> Decimal('1234.56')
    """
    try:
        cleaned = currency_string.replace('XAF', '').replace(',', '').strip()
        return Decimal(cleaned)
    except Exception as e:
        logger.error(f"Failed to parse currency: {str(e)}")
        return Decimal('0')


def calculate_grade_average(grades):
    """
    Calculate average grade from a list of grades.
    """
    if not grades:
        return 0.0

    total = sum(float(g) for g in grades if g is not None)
    count = len([g for g in grades if g is not None])

    return round(total / count, 2) if count > 0 else 0.0


def get_letter_grade(percentage):
    """
    Convert numeric percentage to letter grade.
    Uses common grading scale: A (90-100), B (80-89), C (70-79), D (60-69), F (0-59)
    """
    if percentage is None:
        return 'N/A'

    percentage = float(percentage)

    if percentage >= 90:
        return 'A'
    elif percentage >= 80:
        return 'B'
    elif percentage >= 70:
        return 'C'
    elif percentage >= 60:
        return 'D'
    else:
        return 'F'


def validate_cameroon_phone(phone):
    """
    Validate Cameroon phone number.
    Valid formats: +237XXXXXXXXX, 237XXXXXXXXX, 0XXXXXXXXX
    """
    if not phone:
        return False

    phone = str(phone).strip()

    cameroon_patterns = [
        r'^\+237[0-9]{9}$',
        r'^237[0-9]{9}$',
        r'^0[0-9]{9}$',
    ]

    for pattern in cameroon_patterns:
        if re.match(pattern, phone):
            return True

    return False


def normalize_cameroon_phone(phone):
    """
    Normalize Cameroon phone number to standard format: +237XXXXXXXXX
    """
    if not phone:
        return None

    phone = str(phone).strip()

    phone = re.sub(r'\D', '', phone)

    if phone.startswith('237'):
        return f"+{phone}"
    elif phone.startswith('0'):
        return f"+237{phone[1:]}"
    else:
        return f"+237{phone}"


def paginate_queryset(queryset, page, page_size=20):
    """
    Manually paginate a queryset.
    """
    total = queryset.count()
    start = (page - 1) * page_size
    end = start + page_size

    return {
        'results': queryset[start:end],
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size,
    }


def cache_result(key, func, timeout=3600, *args, **kwargs):
    """
    Execute function and cache the result.
    """
    cached = cache.get(key)

    if cached is not None:
        return cached

    result = func(*args, **kwargs)
    cache.set(key, result, timeout)

    return result


def clear_cache_pattern(pattern):
    """
    Clear all cache keys matching a pattern.
    Note: This works best with certain cache backends.
    """
    try:
        keys = cache.keys(pattern)
        if keys:
            cache.delete_many(keys)
        logger.info(f"Cleared {len(keys)} cache entries matching pattern: {pattern}")
    except Exception as e:
        logger.error(f"Failed to clear cache pattern {pattern}: {str(e)}")


def get_quarters():
    """
    Get academic quarter definitions (for term management).
    """
    return [
        {'name': 'First Term', 'code': 'Q1', 'start_month': 1, 'end_month': 3},
        {'name': 'Second Term', 'code': 'Q2', 'start_month': 4, 'end_month': 7},
        {'name': 'Third Term', 'code': 'Q3', 'start_month': 8, 'end_month': 12},
    ]


def calculate_age(date_of_birth):
    """
    Calculate age from date of birth.
    """
    from datetime import date

    today = date.today()
    return today.year - date_of_birth.year - (
        (today.month, today.day) < (date_of_birth.month, date_of_birth.day)
    )


def validate_email(email):
    """
    Validate email address format.
    """
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, str(email)) is not None


def slugify_name(name):
    """
    Create URL-safe slug from name.
    """
    return slugify(str(name).lower())


def batch_qs(qs, batch_size=100):
    """
    Batch a queryset to avoid loading entire set into memory.
    """
    total = qs.count()

    for start in range(0, total, batch_size):
        end = min(start + batch_size, total)
        yield qs[start:end]


def get_client_ip(request):
    """
    Get the client's IP address from request.
    """
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')

    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR')

    return ip


def is_valid_uuid(value):
    """
    Check if value is a valid UUID.
    """
    import uuid

    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError):
        return False


def truncate_string(text, length=100, suffix='...'):
    """
    Truncate string to specified length with suffix.
    """
    if len(text) <= length:
        return text

    return text[:length - len(suffix)] + suffix
