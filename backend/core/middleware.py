import logging
import json
from django.utils.deprecation import MiddlewareMixin
from django.utils import timezone
from django.middleware.security import SecurityMiddleware
from core.utils import get_client_ip

logger = logging.getLogger(__name__)


class HealthcheckAwareSecurityMiddleware(SecurityMiddleware):
    """
    Skip SSL redirects for the Railway healthcheck endpoint so the platform
    can still enforce secure URLs elsewhere without failing liveness checks.
    """

    HEALTHCHECK_PATHS = {"/api/health/", "/api/health"}

    def process_request(self, request):
        if request.path in self.HEALTHCHECK_PATHS:
            return None
        return super().process_request(request)


class RequestLoggingMiddleware(MiddlewareMixin):
    """
    Log all HTTP requests and responses for debugging and monitoring.
    """

    def process_request(self, request):
        request._start_time = timezone.now()
        request._client_ip = get_client_ip(request)

        logger.info(
            f"Request: {request.method} {request.path} | IP: {request._client_ip} | User: {request.user}"
        )

        return None

    def process_response(self, request, response):
        if hasattr(request, '_start_time'):
            duration = (timezone.now() - request._start_time).total_seconds()
        else:
            duration = 0

        log_level = logging.INFO if response.status_code < 400 else logging.WARNING

        logger.log(
            log_level,
            f"Response: {request.method} {request.path} | Status: {response.status_code} | "
            f"Duration: {duration:.2f}s | IP: {request._client_ip}",
        )

        return response

    def process_exception(self, request, exception):
        logger.error(
            f"Exception: {request.method} {request.path} | Exception: {str(exception)} | IP: {request._client_ip}",
            exc_info=True,
        )

        return None


class SchoolContextMiddleware(MiddlewareMixin):
    """
    Attach school information to request context.
    Makes it available throughout the request lifecycle.
    """

    def process_request(self, request):
        request.school = None

        if not request.user or not request.user.is_authenticated:
            return None

        if hasattr(request.user, 'school'):
            request.school = request.user.school
        elif hasattr(request.user, 'school_id'):
            try:
                from apps.schools.models import School

                request.school = School.objects.get(id=request.user.school_id)
            except Exception as e:
                logger.warning(f"Could not fetch school for user {request.user.id}: {str(e)}")
                request.school = None

        return None


class RequestMetricsMiddleware(MiddlewareMixin):
    """
    Collect request metrics for monitoring.
    """

    def process_request(self, request):
        request._metrics = {
            'start_time': timezone.now(),
            'method': request.method,
            'path': request.path,
            'user_id': request.user.id if request.user and request.user.is_authenticated else None,
        }

        return None

    def process_response(self, request, response):
        if not hasattr(request, '_metrics'):
            return response

        metrics = request._metrics
        metrics['end_time'] = timezone.now()
        metrics['duration'] = (metrics['end_time'] - metrics['start_time']).total_seconds()
        metrics['status_code'] = response.status_code

        try:
            from django.core.cache import cache

            key = f"request_metrics:{metrics['path']}"
            cache.incr(key, 1, 3600)
        except Exception as e:
            logger.warning(f"Failed to record request metrics: {str(e)}")

        return response


class CORSMiddleware(MiddlewareMixin):
    """
    Enhanced CORS headers middleware.
    """

    def process_response(self, request, response):
        origin = request.META.get('HTTP_ORIGIN')

        if origin:
            from django.conf import settings

            if origin in settings.CORS_ALLOWED_ORIGINS or settings.CORS_ALLOW_ALL_ORIGINS:
                response['Access-Control-Allow-Origin'] = origin
                response['Access-Control-Allow-Credentials'] = 'true'
                response['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD'
                response['Access-Control-Allow-Headers'] = (
                    'Content-Type, Authorization, X-Requested-With, Accept, Origin'
                )
                response['Access-Control-Max-Age'] = '3600'

        return response


class UserAuditMiddleware(MiddlewareMixin):
    """
    Track user login/logout events and IP changes.
    """

    def process_request(self, request):
        if not request.user or not request.user.is_authenticated:
            return None

        try:
            current_ip = get_client_ip(request)
            cached_ip_key = f"user_ip:{request.user.id}"

            from django.core.cache import cache

            cached_ip = cache.get(cached_ip_key)

            if cached_ip != current_ip:
                logger.warning(f"IP change detected for user {request.user.id}: {cached_ip} -> {current_ip}")
                cache.set(cached_ip_key, current_ip, 86400)

                from apps.users.models import UserLoginHistory

                UserLoginHistory.objects.create(
                    user=request.user,
                    ip_address=current_ip,
                    user_agent=request.META.get('HTTP_USER_AGENT', ''),
                    login_time=timezone.now(),
                )

        except Exception as e:
            logger.warning(f"Failed to update user audit info: {str(e)}")

        return None


class RateLimitMiddleware(MiddlewareMixin):
    """
    Simple rate limiting by IP address.
    """

    RATE_LIMIT_REQUESTS = 1000
    RATE_LIMIT_WINDOW = 3600

    def process_request(self, request):
        from django.core.cache import cache

        ip = get_client_ip(request)
        key = f"rate_limit:{ip}"

        try:
            request_count = cache.get(key, 0)

            if request_count >= self.RATE_LIMIT_REQUESTS:
                logger.warning(f"Rate limit exceeded for IP: {ip}")
                return response_429(request)

            cache.set(key, request_count + 1, self.RATE_LIMIT_WINDOW)

        except Exception as e:
            logger.warning(f"Rate limiting error: {str(e)}")

        return None


def response_429(request):
    """Return a 429 Too Many Requests response."""
    from django.http import JsonResponse

    return JsonResponse(
        {'status': False, 'message': 'Rate limit exceeded. Please try again later.', 'code': 'rate_limit_exceeded'},
        status=429,
    )


class SecurityHeadersMiddleware(MiddlewareMixin):
    """
    Add security headers to responses.
    """

    def process_response(self, request, response):
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-Frame-Options'] = 'DENY'
        response['X-XSS-Protection'] = '1; mode=block'
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'

        return response


class ErrorHandlingMiddleware(MiddlewareMixin):
    """
    Handle and log unhandled exceptions.
    """

    def process_exception(self, request, exception):
        logger.error(
            f"Unhandled exception in {request.method} {request.path}",
            exc_info=True,
            extra={'user_id': request.user.id if request.user and request.user.is_authenticated else None},
        )

        return None
