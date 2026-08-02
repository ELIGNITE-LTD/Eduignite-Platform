from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter

app_name = 'grades'
from .views import (
    SubjectViewSet, SubjectMaterialViewSet, SequenceViewSet, GradeViewSet,
    TermResultViewSet, AnnualResultViewSet, StudentSubjectEnrollmentViewSet,
    publish_report_cards_api,
    publish_all_report_cards_api,
)

router = DefaultRouter()
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'student-enrollments', StudentSubjectEnrollmentViewSet, basename='student-subject-enrollment')
router.register(r'materials', SubjectMaterialViewSet, basename='subject-material')
router.register(r'sequences', SequenceViewSet, basename='sequence')
router.register(r'grades', GradeViewSet, basename='grade')
router.register(r'term-results', TermResultViewSet, basename='term-result')
router.register(r'annual-results', AnnualResultViewSet, basename='annual-result')

configure_cameroon_calendar = SequenceViewSet.as_view({
    'post': 'configure_cameroon_calendar',
})
teacher_grade_sheet = GradeViewSet.as_view({
    'get': 'teacher_grade_sheet',
})
bulk_create_grades = GradeViewSet.as_view({
    'post': 'bulk_create',
})
class_statistics = GradeViewSet.as_view({
    'get': 'class_statistics',
})
period_statistics = GradeViewSet.as_view({
    'get': 'period_statistics',
})
report_card = GradeViewSet.as_view({
    'get': 'report_card',
})
class_results = GradeViewSet.as_view({
    'get': 'class_results',
})
subject_performance = GradeViewSet.as_view({
    'get': 'subject_performance',
})
publish_report_cards = publish_report_cards_api
publish_report_cards_hyphen = publish_report_cards_api
publish_report_cards_action = publish_report_cards_api
publish_all_report_cards = publish_all_report_cards_api
honour_roll = GradeViewSet.as_view({
    'get': 'honour_roll',
})

urlpatterns = [
    path(
        'sequences/configure-cameroon-calendar/',
        configure_cameroon_calendar,
        name='sequence-configure-cameroon-calendar',
    ),
    path(
        'grades/teacher_grade_sheet/',
        teacher_grade_sheet,
        name='grade-teacher-grade-sheet',
    ),
    path(
        'grades/bulk_create/',
        bulk_create_grades,
        name='grade-bulk-create',
    ),
    path(
        'grades/class_statistics/',
        class_statistics,
        name='grade-class-statistics',
    ),
    path(
        'grades/period_statistics/',
        period_statistics,
        name='grade-period-statistics',
    ),
    path(
        'grades/period-statistics/',
        period_statistics,
        name='grade-period-statistics-hyphen',
    ),
    path(
        'grades/report_card/',
        report_card,
        name='grade-report-card',
    ),
    path(
        'grades/class_results/',
        class_results,
        name='grade-class-results',
    ),
    path(
        'grades/subject_performance/',
        subject_performance,
        name='grade-subject-performance',
    ),
    re_path(
        r'^grades/report_cards/publish/?$',
        publish_report_cards,
        name='grade-report-card-publish',
    ),
    re_path(
        r'^grades/report-cards/publish/?$',
        publish_report_cards_hyphen,
        name='grade-report-card-publish-hyphen',
    ),
    re_path(
        r'^grades/publish-report-cards/?$',
        publish_report_cards_action,
        name='grade-report-card-publish-action',
    ),
    re_path(
        r'^grades/report-cards/publish-all/?$',
        publish_all_report_cards,
        name='grade-report-card-publish-all',
    ),
    re_path(
        r'^grades/publish-all-report-cards/?$',
        publish_all_report_cards,
        name='grade-report-card-publish-all-action',
    ),
    re_path(
        r'^report-cards/publish-all/?$',
        publish_all_report_cards,
        name='grade-report-card-publish-all-short',
    ),
    re_path(
        r'^publish-all-report-cards/?$',
        publish_all_report_cards,
        name='grade-report-card-publish-all-action-short',
    ),
    re_path(
        r'^grades/publish_report_cards/?$',
        publish_report_cards_action,
        name='grade-report-card-publish-action-underscore',
    ),
    re_path(
        r'^report_cards/publish/?$',
        publish_report_cards,
        name='grade-report-card-publish-short',
    ),
    re_path(
        r'^report-cards/publish/?$',
        publish_report_cards_hyphen,
        name='grade-report-card-publish-hyphen-short',
    ),
    re_path(
        r'^publish-report-cards/?$',
        publish_report_cards_action,
        name='grade-report-card-publish-action-short',
    ),
    re_path(
        r'^publish_report_cards/?$',
        publish_report_cards_action,
        name='grade-report-card-publish-action-underscore-short',
    ),
    path(
        'grades/honour-roll/',
        honour_roll,
        name='grade-honour-roll',
    ),
    path(
        'grades/honour_roll/',
        honour_roll,
        name='grade-honour-roll-underscore',
    ),
    path(
        'grades/rewards/honour-roll/',
        honour_roll,
        name='grade-rewards-honour-roll',
    ),
    path('', include(router.urls)),
]
