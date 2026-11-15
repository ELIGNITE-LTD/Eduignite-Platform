import html

from django.db.models import Q
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import services
from .models import ContactStatus, Level, OutreachCampaign, OutreachContact, Region, SendStatus
from .permissions import CanUseOutreach

PERMS = [IsAuthenticated, CanUseOutreach]


class ContactSerializer(serializers.ModelSerializer):
    region_label = serializers.CharField(source='get_region_display', read_only=True)
    level_label = serializers.CharField(source='get_level_display', read_only=True)
    contacted = serializers.SerializerMethodField()

    class Meta:
        model = OutreachContact
        fields = [
            'id', 'school_name', 'level', 'level_label', 'region', 'region_label', 'town', 'email', 'phone',
            'website', 'source_url', 'language', 'notes', 'status', 'contacted', 'sent_count', 'first_sent_at',
            'last_sent_at', 'last_error', 'created_at',
        ]
        read_only_fields = ['id', 'status', 'sent_count', 'first_sent_at', 'last_sent_at', 'last_error', 'created_at']

    def get_contacted(self, obj):
        return obj.sent_count > 0

    def validate_email(self, value):
        email = services.clean_email(value)
        if not email:
            raise serializers.ValidationError('Enter a valid email address.')
        clash = OutreachContact.objects.filter(email__iexact=email)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError('This address is already in the list.')
        return email


def _filtered(params):
    qs = OutreachContact.objects.all()
    region, level, sent = params.get('region'), params.get('level'), params.get('sent')
    status_ = params.get('status')
    if region in Region.values:
        qs = qs.filter(region=region)
    if level in Level.values:
        qs = qs.filter(level=level)
    if sent == 'yes':
        qs = qs.filter(sent_count__gt=0)
    elif sent == 'no':
        qs = qs.filter(sent_count=0)
    if status_ in ContactStatus.values:
        qs = qs.filter(status=status_)
    q = (params.get('q') or '').strip()
    if q:
        qs = qs.filter(Q(school_name__icontains=q) | Q(town__icontains=q) | Q(email__icontains=q))
    return qs


class SummaryView(APIView):
    permission_classes = PERMS

    @extend_schema(tags=['Outreach'])
    def get(self, request):
        return Response(services.summary())


class ContactListCreateView(ListCreateAPIView):
    permission_classes = PERMS
    serializer_class = ContactSerializer

    def get_queryset(self):
        return _filtered(self.request.query_params)

    def perform_create(self, serializer):
        region = serializer.validated_data.get('region')
        extra = {'created_by': self.request.user}
        if 'language' not in serializer.validated_data:
            extra['language'] = services.default_language(region)
        serializer.save(**extra)


class ContactDetailView(RetrieveUpdateDestroyAPIView):
    permission_classes = PERMS
    serializer_class = ContactSerializer
    queryset = OutreachContact.objects.all()


class ContactImportView(APIView):
    permission_classes = PERMS
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(tags=['Outreach'], description='Import schools from a CSV file (school_name, email, level, region, town...).')
    def post(self, request):
        upload = request.FILES.get('file')
        if upload is None:
            return Response({'detail': 'Choose a CSV file.'}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > 5 * 1024 * 1024:
            return Response({'detail': 'The file is too large (5 MB maximum).'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(services.import_contacts(upload, user=request.user))


class MessageSerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=200)
    body = serializers.CharField(max_length=8000)


class SendSerializer(MessageSerializer):
    contact_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False, max_length=5000)
    resend = serializers.BooleanField(required=False, default=False)


class SendView(APIView):
    permission_classes = PERMS

    @extend_schema(tags=['Outreach'], description='Queue a message to the selected schools; delivery is paced by the daily cap.')
    def post(self, request):
        ser = SendSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        campaign, counts = services.queue_campaign(request.user, d['contact_ids'], d['subject'], d['body'], d['resend'])
        # Send the first few straight away so the founder sees it work; the hourly job does the rest.
        sent_now = services.process_queue(limit=5) if campaign else 0
        return Response({**counts, 'sent_now': sent_now, 'campaign': str(campaign.id) if campaign else None,
                         'daily_cap': services.daily_cap()})


class TestSendView(APIView):
    permission_classes = PERMS

    @extend_schema(tags=['Outreach'], description='Send the message to your own address, with a sample school.')
    def post(self, request):
        ser = MessageSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if not request.user.email:
            return Response({'detail': 'Your account has no email address.'}, status=status.HTTP_400_BAD_REQUEST)
        ok = services.send_test(request.user, ser.validated_data['subject'], ser.validated_data['body'])
        if not ok:
            return Response({'detail': 'The email provider did not accept the message. Check the sender address in Brevo.'},
                            status=status.HTTP_502_BAD_GATEWAY)
        return Response({'sent_to': request.user.email})


class CancelView(APIView):
    permission_classes = PERMS

    @extend_schema(tags=['Outreach'], description='Stop every email still waiting to be sent.')
    def post(self, request):
        return Response({'cancelled': services.cancel_queue()})


class CampaignListView(APIView):
    permission_classes = PERMS

    @extend_schema(tags=['Outreach'])
    def get(self, request):
        rows = []
        for c in OutreachCampaign.objects.select_related('sent_by')[:100]:
            sends = c.sends.all()
            rows.append({
                'id': str(c.id), 'subject': c.subject, 'status': c.status, 'created_at': c.created_at,
                'sent_by': getattr(c.sent_by, 'name', '') or '',
                'total': sends.count(),
                'sent': sends.filter(status=SendStatus.SENT).count(),
                'queued': sends.filter(status=SendStatus.QUEUED).count(),
                'failed': sends.filter(status=SendStatus.FAILED).count(),
            })
        return Response(rows)


_PAGE = ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
         '<title>EduIgnite</title></head><body style="font-family:Arial,sans-serif;max-width:480px;margin:15vh auto;'
         'padding:0 20px;color:#111827;text-align:center">{inner}</body></html>')


class UnsubscribeView(APIView):
    """Public. GET shows a button (so a mail scanner opening the link cannot unsubscribe anyone); POST unsubscribes."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    parser_classes = [FormParser, JSONParser, MultiPartParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public_site'

    def get(self, request, token):
        contact = OutreachContact.objects.filter(unsubscribe_token=token).first()
        if contact is None:
            return HttpResponse(_PAGE.format(inner='<h2>Link not valid</h2>'), status=404)
        if contact.status == ContactStatus.UNSUBSCRIBED:
            return HttpResponse(_PAGE.format(inner='<h2>You are unsubscribed</h2><p>We will not email you again.</p>'))
        inner = (f'<h2>Unsubscribe</h2><p>Stop emails from EduIgnite to {html.escape(contact.email)}?</p>'
                 '<form method="post"><button style="padding:10px 22px;font-size:16px;border:0;border-radius:8px;'
                 'background:#1e3a8a;color:#fff;cursor:pointer">Yes, unsubscribe</button></form>')
        return HttpResponse(_PAGE.format(inner=inner))

    def post(self, request, token):
        contact = services.unsubscribe(token)
        if contact is None:
            return HttpResponse(_PAGE.format(inner='<h2>Link not valid</h2>'), status=404)
        return HttpResponse(_PAGE.format(inner='<h2>You are unsubscribed</h2><p>We will not email you again.</p>'))
