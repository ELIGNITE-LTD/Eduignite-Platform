from __future__ import annotations

from typing import Iterable

from apps.students import api as students_api


def sync_subject_metadata(subject):
    class_links = list(subject.class_links.select_related('school_class').all())
    unique_levels = sorted(
        {
            link.school_class.name.strip()
            for link in class_links
            if link.school_class_id and link.school_class.name
        }
    )
    unique_teacher_ids = {
        str(link.teacher_id)
        for link in class_links
        if link.teacher_id
    }

    subject.level = unique_levels[0] if len(unique_levels) == 1 else 'Multiple Classes'
    if len(unique_teacher_ids) == 1:
        subject.teacher = next(
            (link.teacher for link in class_links if link.teacher_id),
            None,
        )
    else:
        subject.teacher = None

    subject.save(update_fields=['level', 'teacher'])


def sync_student_subject_enrollments(student):
    from .models import ClassSubject, StudentSubjectEnrollment

    if not student.school_class_id:
        StudentSubjectEnrollment.objects.filter(student=student).delete()
        return []

    class_subjects = list(
        ClassSubject.objects.filter(school_class_id=student.school_class_id)
        .select_related('subject', 'teacher', 'school_class')
        .order_by('type', 'subject__name')
    )
    valid_class_subject_ids = {class_subject.id for class_subject in class_subjects}

    StudentSubjectEnrollment.objects.filter(student=student).exclude(
        class_subject_id__in=valid_class_subject_ids
    ).delete()

    existing = {
        enrollment.class_subject_id: enrollment
        for enrollment in StudentSubjectEnrollment.objects.filter(
            student=student,
            class_subject_id__in=valid_class_subject_ids,
        )
    }

    enrollments = []
    for class_subject in class_subjects:
        enrollment = existing.get(class_subject.id)
        if not enrollment:
            enrollment = StudentSubjectEnrollment.objects.create(
                student=student,
                class_subject=class_subject,
                is_active=True,
            )
        elif class_subject.type == ClassSubject.SubjectType.MANDATORY and not enrollment.is_active:
            enrollment.is_active = True
            enrollment.save(update_fields=['is_active', 'modified'])
        enrollments.append(enrollment)

    return enrollments


def sync_class_subject_enrollments(class_subject):
    from .models import ClassSubject, StudentSubjectEnrollment

    students = students_api.list_students(school_class=class_subject.school_class_id)
    if not students.exists():
        sync_subject_metadata(class_subject.subject)
        return

    existing = {
        enrollment.student_id: enrollment
        for enrollment in StudentSubjectEnrollment.objects.filter(class_subject=class_subject)
    }

    for student in students:
        enrollment = existing.get(student.id)
        if not enrollment:
            StudentSubjectEnrollment.objects.create(
                student=student,
                class_subject=class_subject,
                is_active=True,
            )
            continue
        if class_subject.type == ClassSubject.SubjectType.MANDATORY and not enrollment.is_active:
            enrollment.is_active = True
            enrollment.save(update_fields=['is_active', 'modified'])

    sync_subject_metadata(class_subject.subject)
