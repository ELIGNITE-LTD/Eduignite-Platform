from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from django.core.cache import cache
import logging

from apps.users.models import FounderProfile

User = get_user_model()
logger = logging.getLogger(__name__)

FOUNDERS_CACHE_KEY = 'public_site:founders'


def _bust_founders_cache():
    """Drop the public founders cache so the website reflects changes at once."""
    try:
        cache.delete(FOUNDERS_CACHE_KEY)
    except Exception:  # cache backend unavailable — never block the save
        pass


@receiver(post_save, sender=User)
def send_welcome_notification(sender, instance, created, **kwargs):
    """
    Send welcome notification when new user is created, and keep the public
    founders/executives list fresh when a founder edits their profile or
    activates their account.
    """
    if created:
        logger.info(f'New user created: {instance.matricule} ({instance.name})')

    # A founder/executive's name, avatar or status changed — show it immediately.
    if FounderProfile.objects.filter(user=instance).exists():
        _bust_founders_cache()


@receiver(post_save, sender=FounderProfile)
@receiver(post_delete, sender=FounderProfile)
def founder_profile_changed(sender, instance, **kwargs):
    """Adding, editing or removing a founder/executive updates the site at once."""
    _bust_founders_cache()
