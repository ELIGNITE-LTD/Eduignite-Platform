from rest_framework.permissions import BasePermission


class IsUser(BasePermission):
    """Check if user has a specific role."""

    def __init__(self, roles):
        self.roles = roles if isinstance(roles, (list, tuple)) else [roles]

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in self.roles


class IsPlatformExecutive(BasePermission):
    """
    Allows access to users with platform-level executive roles:
    SUPER_ADMIN, CEO, CTO, COO, INV, DESIGNER
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in [
            'SUPER_ADMIN',
            'CEO',
            'CTO',
            'COO',
            'INV',
            'DESIGNER',
        ]


class IsSchoolAdmin(BasePermission):
    """
    Allows access to school-level admin users:
    SCHOOL_ADMIN, SUB_ADMIN
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']


class IsSchoolStaff(BasePermission):
    """
    Allows access to school staff members:
    SCHOOL_ADMIN, SUB_ADMIN, TEACHER, BURSAR, LIBRARIAN
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in [
            'SCHOOL_ADMIN',
            'SUB_ADMIN',
            'TEACHER',
            'BURSAR',
            'LIBRARIAN',
        ]


class IsTeacher(BasePermission):
    """Allows access to teacher users."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role == 'TEACHER'


class IsStudent(BasePermission):
    """Allows access to student users."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role == 'STUDENT'


class IsParent(BasePermission):
    """Allows access to parent users."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role == 'PARENT'


class IsBursar(BasePermission):
    """Allows access to bursar users."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role == 'BURSAR'


class IsLibrarian(BasePermission):
    """Allows access to librarian users."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role == 'LIBRARIAN'


class IsOwnerOrExecutive(BasePermission):
    """
    Allows access if user is the object owner or a platform executive.
    Expects the model to have a 'user' or 'owner' field.
    """

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        user_field = getattr(obj, 'user', None) or getattr(obj, 'owner', None)
        if user_field and request.user == user_field:
            return True

        return request.user.role in [
            'SUPER_ADMIN',
            'CEO',
            'CTO',
            'COO',
            'INV',
            'DESIGNER',
        ]


class BelongsToSameSchool(BasePermission):
    """
    Allows access if user and object belong to the same school.
    Expects both user and model to have a 'school_id' attribute.
    """

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        user_school_id = getattr(request.user, 'school_id', None)
        obj_school_id = getattr(obj, 'school_id', None)

        if user_school_id and obj_school_id:
            return user_school_id == obj_school_id

        return False


class IsPlatformExecutiveOrSchoolAdmin(BasePermission):
    """
    Allows access to either platform executives or school admins.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in [
            'SUPER_ADMIN',
            'CEO',
            'CTO',
            'COO',
            'INV',
            'DESIGNER',
            'SCHOOL_ADMIN',
            'SUB_ADMIN',
        ]


class CanManageUsers(BasePermission):
    """
    Allows user management by platform executives and school admins
    in their respective scopes.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in [
            'SUPER_ADMIN',
            'CEO',
            'CTO',
            'COO',
            'SCHOOL_ADMIN',
            'SUB_ADMIN',
        ]

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role in ['SUPER_ADMIN', 'CEO', 'CTO', 'COO']:
            return True

        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            return hasattr(obj, 'school_id') and user.school_id == obj.school_id

        return False


class CanManageSchool(BasePermission):
    """
    Allows school management by platform executives only.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in [
            'SUPER_ADMIN',
            'CEO',
            'CTO',
            'COO',
        ]


class CanAccessAssessments(BasePermission):
    """
    Allows assessment access to teachers (own assessments),
    students (enrolled assessments), and school staff.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in [
            'TEACHER',
            'STUDENT',
            'SCHOOL_ADMIN',
            'SUB_ADMIN',
        ]

    def has_object_permission(self, request, view, obj):
        user = request.user

        if user.role == 'TEACHER':
            return getattr(obj, 'created_by_id', None) == user.id

        if user.role == 'STUDENT':
            enrollment = getattr(obj, 'subject', None)
            if enrollment:
                return user in enrollment.students.all()
            return False

        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            return getattr(obj, 'school_id', None) == user.school_id

        return False


class CanAccessAttendance(BasePermission):
    """
    Allows attendance access to teachers (own classes),
    students (own attendance), and school staff.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in [
            'TEACHER',
            'STUDENT',
            'PARENT',
            'SCHOOL_ADMIN',
            'SUB_ADMIN',
        ]

    def has_object_permission(self, request, view, obj):
        user = request.user

        if user.role == 'TEACHER':
            teacher_class = getattr(obj, 'school_class', None)
            if teacher_class:
                return teacher_class.form_teacher_id == user.id or teacher_class.teachers.filter(id=user.id).exists()
            return False

        if user.role == 'STUDENT':
            student = getattr(obj, 'student', None)
            if student:
                return student.user_id == user.id
            return False

        if user.role == 'PARENT':
            student = getattr(obj, 'student', None)
            if student:
                return student.parents.filter(id=user.id).exists()
            return False

        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            return getattr(obj, 'school_id', None) == user.school_id

        return False


class CanManageFees(BasePermission):
    """
    Allows fee management by bursars and school staff.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in [
            'BURSAR',
            'SCHOOL_ADMIN',
            'SUB_ADMIN',
        ]

    def has_object_permission(self, request, view, obj):
        if request.user.role == 'BURSAR':
            return getattr(obj, 'school_id', None) == request.user.school_id

        if request.user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            return getattr(obj, 'school_id', None) == request.user.school_id

        return False


class CanAccessLibrary(BasePermission):
    """
    Allows library access to librarians and school staff.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in [
            'LIBRARIAN',
            'SCHOOL_ADMIN',
            'SUB_ADMIN',
            'STUDENT',
            'TEACHER',
        ]

    def has_object_permission(self, request, view, obj):
        user = request.user

        if user.role == 'LIBRARIAN':
            return getattr(obj, 'school_id', None) == user.school_id

        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            return getattr(obj, 'school_id', None) == user.school_id

        return True
