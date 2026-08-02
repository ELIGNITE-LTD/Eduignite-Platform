"""Rate limits for AI endpoints.

Every AI call reaches Groq, which costs money per request. A single account —
or a stolen access token — could otherwise sit in a tight loop and run up the
bill or exhaust the model quota for the whole school. This ceiling stays fluid
for a real person while turning a script into a wall of 429s. The rate comes
from the ``ai`` scope in ``DEFAULT_THROTTLE_RATES``.
"""

from rest_framework.throttling import UserRateThrottle


class AIRateThrottle(UserRateThrottle):
    scope = 'ai'
