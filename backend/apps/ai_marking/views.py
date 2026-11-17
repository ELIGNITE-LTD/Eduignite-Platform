import json
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai_features import credit_engine
from apps.ai_features.models import AIRequest
from apps.registry.permissions import RequiresApp
from apps.students.models import Student

from . import services
from .models import MarkedScript, MarkingChallenge, MarkingJob, MarkingPage
from .pdf import build_pdf

STAFF = {'TEACHER', 'SCHOOL_ADMIN', 'SUB_ADMIN'}
MAX_FILES = 40


class IsMarker(permissions.BasePermission):
    message = 'Only teachers and school administrators can mark exam papers.'

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and getattr(u, 'school_id', None) and u.role in STAFF)


def _fmt(d):
    return float(d) if d is not None else None


def script_json(s: MarkedScript):
    return {
        'id': str(s.id), 'index': s.index, 'student': str(s.student_id) if s.student_id else None,
        'student_name': s.student.display_name if s.student_id else '', 'detected_name': s.detected_name,
        'detected_matricule': s.detected_matricule, 'questions': s.questions, 'total': _fmt(s.total), 'feedback': s.feedback,
        'warning': s.warning, 'failed': s.failed, 'edited': s.edited, 'status': s.status, 'published': s.published,
        'open_challenges': s.challenges.filter(status=MarkingChallenge.OPEN).count(),
    }


def job_json(job: MarkingJob, scripts=True):
    data = {
        'id': str(job.id), 'title': job.title, 'approach': job.approach, 'paper_total': _fmt(job.paper_total), 'status': job.status,
        'script_count': job.script_count, 'page_count': job.page_count, 'pages_per_script': job.pages_per_script,
        'estimate_credits': job.estimate_credits, 'progress': job.progress, 'error': job.error,
        'created_at': job.created_at.isoformat(), 'scope_key': job.scope_key,
    }
    if scripts:
        data['scripts'] = [script_json(s) for s in job.scripts.select_related('student').prefetch_related('challenges')]
        data['scheme_text'] = job.scheme_text
    return data


def _my_job(request, pk):
    job = get_object_or_404(MarkingJob, pk=pk, school=request.user.school)
    if request.user.role == 'TEACHER' and job.teacher_id != request.user.id:
        raise PermissionDenied('This marking job belongs to another teacher.')
    return job


def _enqueue(job_id):
    from .tasks import mark_job_task

    try:
        if settings.CELERY_TASK_ALWAYS_EAGER and not getattr(settings, 'AI_ALLOW_SYNC_FALLBACK', False):
            raise RuntimeError('eager')
        mark_job_task.apply_async(args=[str(job_id)], retry=False)
        return True
    except Exception:  # noqa: BLE001
        if getattr(settings, 'AI_ALLOW_SYNC_FALLBACK', False) or settings.CELERY_TASK_ALWAYS_EAGER:
            services.run_job(job_id)
            return True
        return False


class JobListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsMarker, RequiresApp('ai_features')]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        jobs = MarkingJob.objects.filter(school=request.user.school)
        if request.user.role == 'TEACHER':
            jobs = jobs.filter(teacher=request.user)
        if request.query_params.get('scope'):
            jobs = jobs.filter(scope_key=request.query_params['scope'])
        return Response([job_json(j, scripts=False) for j in jobs[:30]])

    @transaction.atomic
    def post(self, request):
        data = request.data
        title = str(data.get('title') or '').strip()[:160]
        if not title:
            return Response({'detail': 'Give the marking a title, for example "Mathematics Sequence 2".'}, status=400)
        try:
            paper_total = Decimal(str(data.get('paper_total')))
            if not (Decimal('1') <= paper_total <= Decimal('1000')):
                raise InvalidOperation
        except (InvalidOperation, TypeError):
            return Response({'detail': 'Say what the paper is out of (for example 50).'}, status=400)
        approach = str(data.get('approach') or 'idea_based')
        if approach not in dict(MarkingJob.APPROACHES):
            return Response({'detail': 'Choose a marking approach.'}, status=400)
        custom = str(data.get('custom_instructions') or '').strip()[:4000]
        if approach == 'custom' and not custom:
            return Response({'detail': 'Write your marking instructions.'}, status=400)
        try:
            per = int(data.get('pages_per_script') or 1)
            if not 1 <= per <= 30:
                raise ValueError
        except ValueError:
            return Response({'detail': 'Pages per script must be between 1 and 30.'}, status=400)
        scheme_text = str(data.get('scheme_text') or '').strip()[:20000]
        scheme_files = request.FILES.getlist('scheme_files')
        script_files = request.FILES.getlist('script_files')
        if not scheme_text and not scheme_files:
            return Response({'detail': 'Add the marking scheme: type it or upload it.'}, status=400)
        if not script_files:
            return Response({'detail': 'Upload the students\' scripts.'}, status=400)
        if len(scheme_files) + len(script_files) > MAX_FILES:
            return Response({'detail': f'Send at most {MAX_FILES} files.'}, status=400)
        try:
            roster_in = json.loads(data.get('roster') or '[]')
        except ValueError:
            roster_in = []
        ids = [r.get('id') for r in roster_in if isinstance(r, dict)]
        found = {str(s.id): s for s in Student.objects.filter(school=request.user.school, id__in=[i for i in ids if i]).select_related('user')}
        roster = [{'id': str(s.id), 'name': s.display_name, 'matricule': s.display_matricule} for s in found.values()]

        scheme_pages = [p for f in scheme_files for p in services.pages_from_upload(f)]
        script_pages = [p for f in script_files for p in services.pages_from_upload(f)]
        if len(scheme_pages) + len(script_pages) > services.MAX_PAGES:
            return Response({'detail': f'That is more than {services.MAX_PAGES} pages in one go. Mark them in smaller batches.'}, status=400)
        if len(script_pages) % per:
            return Response({'detail': f'The scripts have {len(script_pages)} pages, which does not divide into scripts of {per} pages. '
                                       'Check the number of pages per script.'}, status=400)
        job = MarkingJob.objects.create(
            school=request.user.school, teacher=request.user, title=title, scope_key=str(data.get('scope_key') or '')[:120],
            approach=approach, custom_instructions=custom, scheme_text=scheme_text, paper_total=paper_total, pages_per_script=per,
            roster=roster, script_count=len(script_pages) // per, page_count=len(scheme_pages) + len(script_pages),
        )
        MarkingPage.objects.bulk_create(
            [MarkingPage(job=job, kind=MarkingPage.SCHEME, index=i, data=p) for i, p in enumerate(scheme_pages)]
            + [MarkingPage(job=job, kind=MarkingPage.SCRIPT, index=i, data=p) for i, p in enumerate(script_pages)])
        estimate = services.estimate_for(job)
        job.estimate_credits = estimate.credits
        job.save(update_fields=['estimate_credits'])
        config = credit_engine.get_config()
        bal = credit_engine.balance(request.user, config)
        return Response({**job_json(job, scripts=False), 'can_afford': bal['unlimited'] or bal['total_available'] >= estimate.credits,
                         'balance': bal['total_available'], 'unlimited': bal['unlimited']}, status=status.HTTP_201_CREATED)


class JobDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsMarker]

    def get(self, request, pk):
        return Response(job_json(_my_job(request, pk)))

    def delete(self, request, pk):
        _my_job(request, pk).delete()
        return Response(status=204)


class JobStartView(APIView):
    """The teacher's authorisation: the estimated credits are held and the marking begins."""

    permission_classes = [permissions.IsAuthenticated, IsMarker, RequiresApp('ai_features')]

    def post(self, request, pk):
        job = _my_job(request, pk)
        if job.status != MarkingJob.UPLOADED:
            return Response({'detail': 'This marking has already been started.'}, status=400)
        estimate = services.estimate_for(job)
        credit_engine.require_affordable(request.user, estimate, request=request)
        ai_request = AIRequest.objects.create(user=request.user, school=job.school, request_type=services.FEATURE,
                                              prompt=f'Mark exam scripts: {job.title}', status='pending')
        credit_engine.hold_for_request(ai_request, estimate)
        job.ai_request, job.estimate_credits, job.status = ai_request, estimate.credits, MarkingJob.MARKING
        job.save(update_fields=['ai_request', 'estimate_credits', 'status'])
        if not _enqueue(job.id):
            job.refresh_from_db()
            job.status, job.error = MarkingJob.FAILED, 'The marking service is busy. Nothing was charged. Please try again in a moment.'
            job.save(update_fields=['status', 'error'])
            ai_request.mark_failed(job.error)
            from apps.ai_features.credit_models import AICreditHold
            for hold in AICreditHold.objects.filter(ai_request=ai_request, status=AICreditHold.HELD):
                credit_engine.release_hold(hold, 'Could not start')
            return Response({'detail': job.error}, status=503)
        return Response(job_json(job, scripts=False))


def _script(request, pk):
    script = get_object_or_404(MarkedScript.objects.select_related('job', 'student', 'job__school'), pk=pk, job__school=request.user.school)
    if request.user.role == 'TEACHER' and script.job.teacher_id != request.user.id:
        raise PermissionDenied('This script belongs to another teacher.')
    return script


class ScriptView(APIView):
    """The teacher adjusts marks, feedback or the student a script belongs to."""

    permission_classes = [permissions.IsAuthenticated, IsMarker]

    def patch(self, request, pk):
        script = _script(request, pk)
        d = request.data
        if 'questions' in d:
            questions = services.clean_questions(d['questions'])
            if not questions:
                return Response({'detail': 'A script needs at least one question.'}, status=400)
            script.questions = questions
            script.total = services.total_of(questions)
            maximum = sum(Decimal(str(q['max'])) for q in questions)
            script.warning = '' if maximum == script.job.paper_total else f'The questions add up to {maximum} but the paper is out of {script.job.paper_total}.'
        if 'feedback' in d:
            script.feedback = str(d['feedback'])[:1500]
        if 'student' in d:
            if d['student']:
                student = get_object_or_404(Student, pk=d['student'], school=request.user.school)
                if MarkedScript.objects.filter(job=script.job, student=student).exclude(pk=script.pk).exists():
                    return Response({'detail': 'Another script of this batch already belongs to that student.'}, status=400)
                script.student = student
            else:
                script.student = None
        script.edited = True
        script.failed = False if script.questions else script.failed
        script.status = MarkedScript.DRAFT
        script.published = False
        script.save()
        return Response(script_json(script))


class ScriptApproveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsMarker]

    def post(self, request, pk):
        script = _script(request, pk)
        approve = request.data.get('approved', True) is not False
        if approve and (script.failed or not script.questions):
            return Response({'detail': 'Mark this script first.'}, status=400)
        if approve and not script.student_id:
            return Response({'detail': 'Choose which student this script belongs to first.'}, status=400)
        script.status = MarkedScript.APPROVED if approve else MarkedScript.DRAFT
        if not approve:
            script.published = False
        script.save(update_fields=['status', 'published'])
        return Response(script_json(script))


class JobApproveAllView(APIView):
    """Approve every script that is marked and has a student; the rest stay for the teacher to look at."""

    permission_classes = [permissions.IsAuthenticated, IsMarker]

    def post(self, request, pk):
        job = _my_job(request, pk)
        ok = job.scripts.filter(failed=False, student__isnull=False).exclude(questions=[])
        count = ok.update(status=MarkedScript.APPROVED)
        left = job.scripts.exclude(status=MarkedScript.APPROVED).count()
        return Response({'approved': count, 'left': left})


class JobPublishView(APIView):
    """Share the approved scripts with their students (they see score, mistakes and corrections, and can ask questions)."""

    permission_classes = [permissions.IsAuthenticated, IsMarker]

    def post(self, request, pk):
        job = _my_job(request, pk)
        scripts = list(job.scripts.filter(status=MarkedScript.APPROVED, student__isnull=False).select_related('student__user'))
        if not scripts:
            return Response({'detail': 'Approve at least one script first.'}, status=400)
        now = timezone.now()
        MarkedScript.objects.filter(pk__in=[s.pk for s in scripts]).update(published=True, published_at=now)
        try:
            from apps.notifications.utils import notify_users

            users = [s.student.user for s in scripts if s.student.user_id]
            if users:
                notify_users(users, 'Your marked paper is ready',
                             f'{job.title}: your marked script is available with your score, corrections and feedback. '
                             'If you think an answer was marked wrongly, you can raise a question for your teacher.',
                             sender=request.user)
        except Exception:  # noqa: BLE001 - telling students must never undo the publishing
            pass
        return Response({'published': len(scripts)})


class ScriptPdfView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsMarker]

    def get(self, request, pk):
        s = _script(request, pk)
        return _pdf([s], f'marked-script-{s.index + 1}.pdf')


class JobPdfView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsMarker]

    def get(self, request, pk):
        job = _my_job(request, pk)
        scripts = list(job.scripts.exclude(questions=[]).select_related('student', 'job', 'job__school').order_by('index'))
        if not scripts:
            return Response({'detail': 'Nothing is marked yet.'}, status=400)
        return _pdf(scripts, 'marked-scripts.pdf')


def _pdf(scripts, name):
    response = HttpResponse(build_pdf(scripts), content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="{name}"'
    return response


# --- challenges (teacher side) -------------------------------------------------

def challenge_json(c: MarkingChallenge):
    s = c.script
    return {'id': str(c.id), 'script': str(s.id), 'job_title': s.job.title, 'student_name': s.student.display_name if s.student_id else '',
            'question_no': c.question_no, 'message': c.message, 'status': c.status, 'response': c.response,
            'new_awarded': _fmt(c.new_awarded), 'created_at': c.created_at.isoformat(),
            'question': next((q for q in s.questions if str(q.get('no')) == c.question_no), None)}


class ChallengeListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsMarker]

    def get(self, request):
        qs = MarkingChallenge.objects.filter(script__job__school=request.user.school).select_related('script__job', 'script__student')
        if request.user.role == 'TEACHER':
            qs = qs.filter(script__job__teacher=request.user)
        if request.query_params.get('status') in ('open', 'resolved'):
            qs = qs.filter(status=request.query_params['status'])
        return Response([challenge_json(c) for c in qs[:100]])


class ChallengeRespondView(APIView):
    """Answer a challenge, optionally changing the mark of that question (the script total follows)."""

    permission_classes = [permissions.IsAuthenticated, IsMarker]

    def post(self, request, pk):
        c = get_object_or_404(MarkingChallenge.objects.select_related('script__job', 'script__student'), pk=pk, script__job__school=request.user.school)
        if request.user.role == 'TEACHER' and c.script.job.teacher_id != request.user.id:
            raise PermissionDenied('This question is for another teacher.')
        response = str(request.data.get('response') or '').strip()[:1500]
        if not response:
            return Response({'detail': 'Write a short answer for the student.'}, status=400)
        with transaction.atomic():
            raw = request.data.get('new_awarded')
            if raw not in (None, ''):
                try:
                    value = Decimal(str(raw))
                except InvalidOperation:
                    return Response({'detail': 'The new mark must be a number.'}, status=400)
                questions = list(c.script.questions)
                target = next((q for q in questions if str(q.get('no')) == c.question_no), None)
                if target is None:
                    return Response({'detail': 'That question is not on this script.'}, status=400)
                if value < 0 or value > Decimal(str(target['max'])):
                    return Response({'detail': f'The mark must be between 0 and {target["max"]}.'}, status=400)
                target['awarded'] = float(value)
                c.script.questions = questions
                c.script.total = services.total_of(questions)
                c.script.edited = True
                c.script.save(update_fields=['questions', 'total', 'edited'])
                c.new_awarded = value
            c.response, c.status, c.resolved_at = response, MarkingChallenge.RESOLVED, timezone.now()
            c.save()
        try:
            from apps.notifications.utils import notify_users

            if c.script.student_id and c.script.student.user_id:
                notify_users([c.script.student.user], 'Your teacher answered your question',
                             f'{c.script.job.title}, question {c.question_no}: {response[:140]}', sender=request.user)
        except Exception:  # noqa: BLE001
            pass
        return Response(challenge_json(c))


# --- student side --------------------------------------------------------------

def _student_of(user):
    return Student.objects.filter(user=user).first()


def student_script_json(s: MarkedScript):
    data = script_json(s)
    data.update({'title': s.job.title, 'paper_total': _fmt(s.job.paper_total), 'published_at': s.published_at.isoformat() if s.published_at else None,
                 'challenges': [{'id': str(c.id), 'question_no': c.question_no, 'message': c.message, 'status': c.status, 'response': c.response,
                                 'new_awarded': _fmt(c.new_awarded)} for c in s.challenges.all()]})
    for key in ('detected_name', 'detected_matricule', 'warning', 'failed', 'edited', 'student', 'open_challenges'):
        data.pop(key, None)
    return data


class MyScriptsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        student = _student_of(request.user)
        if not student:
            return Response([])
        scripts = MarkedScript.objects.filter(student=student, published=True).select_related('job').prefetch_related('challenges').order_by('-published_at')
        return Response([student_script_json(s) for s in scripts])


def _mine(request, pk):
    student = _student_of(request.user)
    return get_object_or_404(MarkedScript.objects.select_related('job', 'job__school', 'student'), pk=pk, student=student, published=True)


class MyScriptDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        return Response(student_script_json(_mine(request, pk)))


class MyScriptPdfView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        return _pdf([_mine(request, pk)], 'my-marked-paper.pdf')


class MyScriptChallengeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        script = _mine(request, pk)
        message = str(request.data.get('message') or '').strip()[:1000]
        if len(message) < 5:
            return Response({'detail': 'Tell your teacher what you think is wrong, in a few words.'}, status=400)
        no = str(request.data.get('question_no') or '')[:20]
        if no and not any(str(q.get('no')) == no for q in script.questions):
            return Response({'detail': 'That question is not on your paper.'}, status=400)
        if MarkingChallenge.objects.filter(script=script, question_no=no, status=MarkingChallenge.OPEN).count() >= 1:
            return Response({'detail': 'You already asked about this question. Your teacher has not answered yet.'}, status=400)
        c = MarkingChallenge.objects.create(script=script, question_no=no, message=message, created_by=request.user)
        try:
            from apps.notifications.utils import notify_users

            notify_users([script.job.teacher], 'A student questioned a mark',
                         f'{script.student.display_name} asked about question {no or "(general)"} in {script.job.title}.', sender=request.user)
        except Exception:  # noqa: BLE001
            pass
        return Response({'id': str(c.id), 'status': c.status}, status=201)
