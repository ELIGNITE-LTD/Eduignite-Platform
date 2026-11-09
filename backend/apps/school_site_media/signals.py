"""Remove image files from storage when their rows are deleted."""

from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import PublicEvent, PublicMedia


def _drop(*files):
    for f in files:
        if f and f.name:
            try:
                f.storage.delete(f.name)
            except Exception:  # a missing file must never block a delete
                pass


@receiver(post_delete, sender=PublicMedia)
def media_deleted(sender, instance, **kwargs):
    _drop(instance.image, instance.thumbnail)


@receiver(post_delete, sender=PublicEvent)
def event_deleted(sender, instance, **kwargs):
    _drop(instance.cover_image)
