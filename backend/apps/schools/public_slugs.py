"""Addresses for public school profile pages (/school/<slug>).

Plain functions over a model class, so the School model and the migration
that backfilled existing schools produce slugs by exactly the same rules.
"""

from django.utils.text import slugify

MAX_LENGTH = 90


def unique_public_slug(school, model=None):
    model = model or type(school)

    def taken(candidate):
        return model.objects.filter(public_slug=candidate).exclude(pk=school.pk).exists()

    place = school.city_village or school.location or ''
    candidates = [slugify(school.name), slugify(f'{school.name} {place}')]
    for candidate in candidates:
        candidate = candidate[:MAX_LENGTH].strip('-')
        if candidate and not taken(candidate):
            return candidate

    root = (candidates[0][: MAX_LENGTH - 6].strip('-')) or 'school'
    counter = 2
    while taken(f'{root}-{counter}'):
        counter += 1
    return f'{root}-{counter}'
