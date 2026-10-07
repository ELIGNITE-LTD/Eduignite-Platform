import logging
import uuid

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import UserRole
from apps.users.referrals import get_or_create_referral_code

from .models import InvestmentInterest, PartnerProfile
from .serializers import (
    InvestmentInterestSerializer,
    PartnerLoginSerializer,
    PartnerProfileSerializer,
    PartnerRegisterSerializer,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def _session(user):
    """The same platform JWT session shape every self-serve account returns."""
    refresh = RefreshToken.for_user(user)
    return {
        'access_token': str(refresh.access_token),
        'refresh_token': str(refresh),
        'user': {
            'id': str(user.id),
            'name': user.name,
            'email': user.email,
            'matricule': user.matricule,
            'role': user.role,
            'referral_code': get_or_create_referral_code(user),
        },
    }


def _partner_or_403(request):
    user = request.user
    if not getattr(user, 'is_authenticated', False) or user.role != UserRole.PARTNER:
        return Response({'detail': 'Partner account required.'}, status=status.HTTP_403_FORBIDDEN)
    return None


@api_view(['POST'])
@permission_classes([AllowAny])
def partner_register(request):
    """Create a self-serve partner account and return a signed-in session."""
    serializer = PartnerRegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    email = data['email'].strip().lower()
    if User.objects.filter(email__iexact=email).exists():
        return Response(
            {'detail': 'An account with this email already exists. Please sign in instead.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(
        matricule=f'PTR-{uuid.uuid4().hex[:10].upper()}',
        name=data['name'].strip(),
        email=email,
        role=UserRole.PARTNER,
        password=data['password'],
    )
    PartnerProfile.objects.create(
        user=user,
        organization=(data.get('organization') or '').strip(),
        phone=(data.get('phone') or '').strip(),
        country=(data.get('country') or 'Cameroon').strip(),
    )
    get_or_create_referral_code(user)
    return Response(_session(user), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def partner_login(request):
    """Sign a partner in with email + password."""
    serializer = PartnerLoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data['email'].strip().lower()

    user = User.objects.filter(email__iexact=email, role=UserRole.PARTNER).first()
    # One message for every failure, so the form never reveals which emails exist.
    if user is None or not user.is_active or not user.check_password(serializer.validated_data['password']):
        return Response(
            {'detail': 'The email address or password is incorrect.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    return Response(_session(user), status=status.HTTP_200_OK)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def partner_me(request):
    """Read or update the signed-in partner's profile."""
    error = _partner_or_403(request)
    if error:
        return error
    profile, _ = PartnerProfile.objects.get_or_create(user=request.user)

    if request.method == 'PATCH':
        serializer = PartnerProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    return Response(PartnerProfileSerializer(profile).data)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def partner_investments(request):
    """List the partner's investment interests, or register a new one."""
    error = _partner_or_403(request)
    if error:
        return error

    if request.method == 'POST':
        serializer = InvestmentInterestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        interest = serializer.save(partner=request.user, currency='XAF')
        logger.info('Partner %s registered investment interest %s XAF', request.user.id, interest.amount)
        return Response(InvestmentInterestSerializer(interest).data, status=status.HTTP_201_CREATED)

    interests = InvestmentInterest.objects.filter(partner=request.user)
    return Response(InvestmentInterestSerializer(interests, many=True).data)
