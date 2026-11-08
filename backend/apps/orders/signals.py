from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Order
from .notifications import notify_order_processed, notify_order_received


@receiver(post_save, sender=Order, dispatch_uid='orders_order_emails')
def order_emails(sender, instance, created, raw=False, **kwargs):
    """Request received -> executives + acknowledgement; processed -> requester.

    Each is sent after commit, once (see ``EmailNotificationLog``), and a failure
    never reaches the caller.
    """
    if raw:
        return
    if created:
        notify_order_received(instance.pk)
    if instance.status == 'processed':
        notify_order_processed(instance.pk)
