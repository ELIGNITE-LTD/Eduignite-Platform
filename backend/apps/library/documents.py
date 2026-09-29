"""The data behind the two library request documents.

* ``requester_document`` — the confirmation the person who made the request
  downloads (a student, or a teacher who requested a book). It carries only
  what that person is entitled to see about their own request.
* ``official_record`` — the administrative record for librarians and school
  administrators: full book, requester and circulation details, a timeline of
  the events the system actually recorded, and the internal loan notes.

Both are built here, server-side, after the view has checked who is asking, so
an administrative field can never reach a requester by a frontend oversight.
Empty values are dropped rather than sent as blanks, and no date is ever
guessed: an event without a recorded timestamp is listed without one.
"""

from django.utils import timezone


def request_reference(book_request):
    return f"LR-{book_request.pk:04d}"


def _compact(data):
    """Drop keys whose value is empty, so documents never show blank rows."""
    return {key: value for key, value in data.items() if value not in (None, '', [], {})}


def _iso(value):
    return value.isoformat() if value else None


def _school_branding(school):
    if not school:
        return {}
    address_parts = []
    for part in (school.address, school.city_village, school.division):
        part = (part or '').strip()
        if part and part.lower() not in {existing.lower() for existing in address_parts}:
            address_parts.append(part)
    if not address_parts and (school.location or '').strip():
        address_parts.append(school.location.strip())
    return _compact({
        'name': school.name,
        'short_name': school.short_name,
        'motto': school.motto,
        'logo': school.logo,
        'address': ', '.join(address_parts),
        'phone': school.phone,
        'email': school.email,
    })


def display_status(book_request):
    """One word for where the request stands, loan outcome included."""
    loan = book_request.loan
    if loan is not None:
        if loan.status == 'Returned' or loan.returned_date:
            return 'returned'
        if loan.status == 'Lost':
            return 'lost'
        if loan.status == 'Overdue' or loan.is_overdue():
            return 'overdue'
        return 'issued'
    return book_request.status


def _requester(user, *, official):
    student = getattr(user, 'student_profile', None)
    data = {
        'name': user.get_full_name(),
        'role': user.role,
        'role_label': user.get_role_display(),
    }
    if student is not None:
        data['admission_number'] = student.admission_number
        data['class_name'] = (student.school_class.name if student.school_class_id else '') or student.student_class
    elif official:
        # Staff are identified by their EduIgnite matricule; the user model
        # has no separate staff number or department field.
        data['matricule'] = user.matricule
    return _compact(data)


def _book(book, *, official):
    data = {
        'title': book.title,
        'author': book.author,
        'category': book.category.name if book.category_id else '',
        'isbn': book.isbn,
    }
    if official:
        data.update({
            'publisher': book.publisher,
            'publication_year': book.publication_year,
            'location': book.location,
            'is_active': book.is_active,
            'total_copies': book.total_copies,
            'available_copies': book.available_copies,
        })
    return _compact(data)


def _review(book_request):
    """Who reviewed the request and when, using only recorded timestamps."""
    if not book_request.reviewed_by_id and book_request.status == 'pending':
        return {}
    if book_request.status == 'fulfilled':
        reviewed_at = book_request.approved_at or book_request.fulfilled_at
    elif book_request.status == 'approved':
        reviewed_at = book_request.approved_at
    else:
        # A rejection or cancellation has no timestamp of its own.
        reviewed_at = None
    return _compact({
        'reviewed_by': book_request.reviewed_by.get_full_name() if book_request.reviewed_by_id else '',
        'reviewed_at': _iso(reviewed_at),
        'review_note': book_request.review_note,
    })


def _timeline(book_request):
    loan = book_request.loan
    events = [{'event': 'submitted', 'at': _iso(book_request.created_at)}]
    reviewer = book_request.reviewed_by.get_full_name() if book_request.reviewed_by_id else ''
    if book_request.approved_at and book_request.approved_at != book_request.fulfilled_at:
        events.append({'event': 'approved', 'at': _iso(book_request.approved_at), 'by': reviewer})
    if book_request.status == 'rejected':
        events.append({'event': 'rejected', 'by': reviewer})
    if book_request.status == 'cancelled':
        events.append({'event': 'cancelled'})
    if loan is not None:
        events.append({
            'event': 'issued',
            'at': _iso(loan.issued_date),
            'by': loan.librarian.get_full_name() if loan.librarian_id else '',
        })
        if loan.returned_date:
            events.append({'event': 'returned', 'at': _iso(loan.returned_date)})
        elif loan.status == 'Lost':
            events.append({'event': 'lost'})
    elif book_request.fulfilled_at:
        events.append({'event': 'fulfilled', 'at': _iso(book_request.fulfilled_at), 'by': reviewer})
    return [_compact(event) for event in events]


def _loan(loan, *, official):
    if loan is None:
        return {}
    data = {
        'issued_date': _iso(loan.issued_date),
        'due_date': _iso(loan.due_date),
        'returned_date': _iso(loan.returned_date),
    }
    if official:
        data.update({
            'status': loan.status,
            'issued_by': loan.librarian.get_full_name() if loan.librarian_id else '',
            'fine_amount': str(loan.fine_amount) if loan.fine_amount else '',
            'fine_paid': loan.fine_paid if loan.fine_amount else None,
        })
    return _compact(data)


def _base(book_request, *, official):
    return {
        'reference': request_reference(book_request),
        'request_type': book_request.request_type,
        'status': book_request.status,
        'display_status': display_status(book_request),
        'submitted_at': _iso(book_request.created_at),
        'requester_note': book_request.note,
        'school': _school_branding(book_request.school),
        'book': _book(book_request.book, official=official),
        'requester': _requester(book_request.requester, official=official),
        'review': _review(book_request),
        'loan': _loan(book_request.loan, official=official),
        'generated_at': _iso(timezone.now()),
    }


def requester_document(book_request):
    return _compact(_base(book_request, official=False))


def official_record(book_request):
    data = _base(book_request, official=True)
    data['timeline'] = _timeline(book_request)
    loan = book_request.loan
    data['administrative_notes'] = (loan.notes or '').strip() if loan is not None else ''
    return _compact(data)
