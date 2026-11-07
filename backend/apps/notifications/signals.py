import logging

from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.assignments.models import Assignment, AssignmentSubmission
from apps.attendance.models import AttendanceRecord
from apps.community.models import CommunityBlog
from apps.exams.models import Exam
from apps.fees.models import Payment
from apps.grades.models import Grade
from apps.live_classes.models import LiveClass
from apps.students import api as students_api
from apps.support.models import SupportContribution
from apps.announcements.models import Announcement

from .models import NotificationPriority, NotificationType
from .services import create_notification, create_notifications

logger = logging.getLogger(__name__)
User = get_user_model()


def _school_staff(school, roles):
    if not school:
        return User.objects.none()
    return User.objects.filter(school=school, role__in=roles, is_active=True)


def _student_parents(student):
    return [
        parent
        for parent in students_api.get_guardian_users(student)
        if getattr(parent, 'is_active', True)
    ]


def _class_students(school_class=None, class_name='', school=None):
    qs = students_api.list_students(
        school=school,
        school_class=school_class,
        class_name='' if school_class is not None else (class_name or ''),
    )
    return [student.user for student in qs if student.user_id]


@receiver(post_save, sender=Assignment)
def assignment_created_notification(sender, instance, created, **kwargs):
    if not created or instance.status != Assignment.Status.PUBLISHED:
        return
    recipients = _class_students(instance.school_class, instance.target_class, instance.school)
    create_notifications(
        recipients=recipients,
        sender=instance.teacher,
        title=f'New assignment: {instance.title}',
        message=f'{instance.subject.name} assignment is due on {instance.due_date:%Y-%m-%d %H:%M}.',
        notification_type=NotificationType.ASSIGNMENT,
        priority=NotificationPriority.NORMAL,
        icon='clipboard-list',
        url=f'/dashboard/assignments/{instance.id}',
    )


@receiver(post_save, sender=AssignmentSubmission)
def assignment_submission_notification(sender, instance, created, **kwargs):
    if created:
        recipients = [u for u in [instance.assignment.teacher, instance.assignment.subject.teacher] if u]
        recipients.extend(_school_staff(instance.assignment.school, ['SCHOOL_ADMIN', 'SUB_ADMIN']))
        create_notifications(
            recipients=recipients,
            sender=instance.student.user,
            title=f'Assignment submitted: {instance.assignment.title}',
            message=f'{instance.student.display_name} submitted assignment work.',
            notification_type=NotificationType.ASSIGNMENT,
            icon='send',
            url=f'/dashboard/assignments/{instance.assignment_id}/submissions',
        )
    elif instance.status == AssignmentSubmission.Status.GRADED:
        create_notifications(
            recipients=[instance.student.user],
            sender=instance.graded_by,
            title=f'Assignment graded: {instance.assignment.title}',
            message=f'Your assignment has been graded. Score: {instance.score}.',
            notification_type=NotificationType.GRADE_PUBLISHED,
            priority=NotificationPriority.HIGH,
            icon='graduation-cap',
            url=f'/dashboard/assignments/{instance.assignment_id}',
        )
        create_notifications(
            recipients=_student_parents(instance.student),
            sender=instance.graded_by,
            title=f'Grade published for {instance.student.display_name}',
            message=f'{instance.assignment.title} has been graded. Score: {instance.score}.',
            notification_type=NotificationType.PARENT_NOTIFICATION,
            icon='users',
            url=f'/dashboard/children/{instance.student_id}/grades',
        )


@receiver(post_save, sender=Exam)
def exam_notification(sender, instance, created, **kwargs):
    if not created:
        return
    recipients = _class_students(instance.school_class, getattr(instance, 'class_name', ''), instance.school)
    create_notifications(
        recipients=recipients,
        sender=getattr(instance, 'created_by', None),
        title=f'Exam scheduled: {instance.title}',
        message='A new examination has been scheduled.',
        notification_type=NotificationType.EXAMINATION,
        priority=NotificationPriority.HIGH,
        icon='calendar-clock',
        url=f'/dashboard/exams/{instance.id}',
    )


@receiver(post_save, sender=Grade)
def grade_notification(sender, instance, created, **kwargs):
    if not created:
        return
    create_notifications(
        recipients=[instance.student.user],
        sender=getattr(instance, 'teacher', None),
        title=f'Grade published: {instance.subject.name}',
        message=f'Your grade for {instance.subject.name} is now available.',
        notification_type=NotificationType.GRADE_PUBLISHED,
        priority=NotificationPriority.HIGH,
        icon='award',
        url='/dashboard/grades',
    )
    create_notifications(
        recipients=_student_parents(instance.student),
        sender=getattr(instance, 'teacher', None),
        title=f'Grade published for {instance.student.display_name}',
        message=f'A grade for {instance.subject.name} is now available.',
        notification_type=NotificationType.PARENT_NOTIFICATION,
        icon='award',
        url='/dashboard/grades',
    )


@receiver(post_save, sender=AttendanceRecord)
def attendance_notification(sender, instance, created, **kwargs):
    if not created:
        return
    if getattr(instance, 'status', '') in ['absent', 'late', 'excused']:
        create_notifications(
            recipients=list(_student_parents(instance.student)) + [instance.student.user],
            title='Attendance marked',
            message=f'Attendance status: {instance.status}.',
            notification_type=NotificationType.ATTENDANCE,
            icon='calendar-check',
            url='/dashboard/attendance',
        )


@receiver(post_save, sender=Payment)
def fee_payment_notification(sender, instance, created, **kwargs):
    if not created:
        return
    student = getattr(instance, 'student', None)
    if not student:
        return
    create_notifications(
        recipients=([student.user] if student.user_id else []) + list(_student_parents(student)) + list(_school_staff(instance.school, ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR'])),
        title='Fee payment recorded',
        message='A fee payment has been recorded successfully.',
        notification_type=NotificationType.FEE_PAYMENT,
        priority=NotificationPriority.NORMAL,
        icon='credit-card',
        url='/dashboard/fees',
    )


@receiver(post_save, sender=Announcement)
def announcement_notification(sender, instance, created, **kwargs):
    if not created:
        return
    # Same recipient rule the announcement feed uses, so a notification can
    # never reach someone who would not see the announcement itself.
    from apps.announcements.audience import recipients_for_announcement

    create_notifications(
        recipients=recipients_for_announcement(instance),
        sender=instance.sender,
        title=f'Announcement: {instance.title}',
        message=getattr(instance, 'content', '')[:500] or 'A new announcement is available.',
        notification_type=NotificationType.ANNOUNCEMENT,
        icon='megaphone',
        url=f'/dashboard/announcements/{instance.id}',
    )


@receiver(post_save, sender=SupportContribution)
def support_notification(sender, instance, created, **kwargs):
    recipients = User.objects.filter(role__in=['CEO', 'CTO', 'SUPER_ADMIN'], is_active=True)
    create_notifications(
        recipients=recipients,
        sender=getattr(instance, 'user', None),
        title='Support request updated' if not created else 'New support request',
        message=getattr(instance, 'message', '')[:500] or 'A support ticket changed status.',
        notification_type=NotificationType.SUPPORT,
        priority=NotificationPriority.HIGH if created else NotificationPriority.NORMAL,
        icon='life-buoy',
        url='/dashboard/support',
    )


@receiver(post_save, sender=CommunityBlog)
def community_notification(sender, instance, created, **kwargs):
    if not created:
        return
    recipients = User.objects.filter(role__in=['CEO', 'CTO', 'SUPER_ADMIN'], is_active=True)
    create_notifications(
        recipients=recipients,
        sender=getattr(instance, 'author', None),
        title='New community post',
        message=getattr(instance, 'title', 'A new community post was created.'),
        notification_type=NotificationType.COMMUNITY,
        icon='message-square',
        url='/dashboard/community',
    )


@receiver(post_save, sender=LiveClass)
def live_class_notification(sender, instance, created, **kwargs):
    if not created:
        return
    recipients = _class_students(getattr(instance, 'school_class', None), getattr(instance, 'target_class', ''), instance.school)
    create_notifications(
        recipients=recipients,
        sender=getattr(instance, 'teacher', None),
        title=f'Live class scheduled: {instance.title}',
        message='A new live class has been scheduled.',
        notification_type=NotificationType.LIVE_CLASS,
        priority=NotificationPriority.HIGH,
        icon='video',
        url=f'/dashboard/live-classes/{instance.id}',
    )
