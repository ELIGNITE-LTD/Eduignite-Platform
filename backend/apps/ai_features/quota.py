"""How many questions a person may ask the assistant today.

Every answer costs money to produce, so the assistant is not unlimited. A free
account gets a small number of questions each day and is told plainly how many
are left; anyone who needs more moves to Pro.

The count is taken from the `AIRequest` rows the chat already writes, so there
is one record of what was asked and no second tally to drift from it. It resets
at midnight in the server's timezone, which is the same midnight the existing
daily reset task uses.

Only the open chat is counted. A teacher generating an exam or a report is
doing the school's work, not asking a question, and those features have their
own per-feature limits in `utils.FEATURE_DAILY_LIMITS`.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

#: The request type the open chat writes. Only these are counted.
CHAT_REQUEST_TYPE = 'general'

#: Plans a person can be on. Kept as plain strings so the value in the database
#: is readable and a new plan does not need a migration to be recognised.
PLAN_FREE = 'free'
PLAN_PRO = 'pro'


def daily_limit_for(user) -> int:
    """How many chat questions this account may ask in a day."""

    if is_pro(user):
        return int(getattr(settings, 'AI_CHAT_PRO_DAILY_LIMIT', 100))
    return int(getattr(settings, 'AI_CHAT_DAILY_LIMIT', 5))


def is_pro(user) -> bool:
    """Whether this account is on the Pro plan.

    Platform executives are not on a plan: they run the platform, and stopping
    the CEO mid-question to sell them a subscription would be absurd.
    """

    if getattr(user, 'is_platform_executive', False):
        return True
    return (getattr(user, 'ai_plan', PLAN_FREE) or PLAN_FREE).lower() == PLAN_PRO


def start_of_today():
    return timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)


def questions_used_today(user) -> int:
    from .models import AIRequest

    return AIRequest.objects.filter(
        user=user,
        request_type=CHAT_REQUEST_TYPE,
        created_at__gte=start_of_today(),
    ).count()


@dataclass(frozen=True)
class ChatQuota:
    limit: int
    used: int
    remaining: int
    is_pro: bool
    plan: str
    #: When the count goes back to zero, so the apps can say "tomorrow morning"
    #: rather than making the reader guess.
    resets_at: str

    @property
    def exhausted(self) -> bool:
        return self.remaining <= 0

    def as_dict(self) -> dict:
        data = asdict(self)
        data['exhausted'] = self.exhausted
        return data


def chat_quota(user) -> ChatQuota:
    """Where this person stands today, in the shape the apps display."""

    limit = daily_limit_for(user)
    used = questions_used_today(user)
    pro = is_pro(user)
    return ChatQuota(
        limit=limit,
        used=used,
        remaining=max(0, limit - used),
        is_pro=pro,
        plan=PLAN_PRO if pro else PLAN_FREE,
        resets_at=(start_of_today() + timedelta(days=1)).isoformat(),
    )
