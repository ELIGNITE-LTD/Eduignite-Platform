from django.test import SimpleTestCase
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from core.pagination import StandardResultsSetPagination


def page_size_for(query):
    request = Request(APIRequestFactory().get('/x/', query))
    return StandardResultsSetPagination().get_page_size(request)


class StandardPaginationTests(SimpleTestCase):
    def test_default_is_twenty(self):
        self.assertEqual(page_size_for({}), 20)

    def test_page_size_param(self):
        self.assertEqual(page_size_for({'page_size': 250}), 250)

    def test_limit_is_an_alias_for_page_size(self):
        self.assertEqual(page_size_for({'limit': 300}), 300)

    def test_page_size_takes_precedence_over_limit(self):
        self.assertEqual(page_size_for({'page_size': 5, 'limit': 300}), 5)

    def test_ceiling_clamps_instead_of_failing(self):
        self.assertEqual(page_size_for({'page_size': 999999}), StandardResultsSetPagination.max_page_size)
        self.assertEqual(page_size_for({'limit': 999999}), StandardResultsSetPagination.max_page_size)

    def test_invalid_values_fall_back_to_default(self):
        for bad in ('abc', '0', '-1', ''):
            self.assertEqual(page_size_for({'limit': bad}), 20, bad)
            self.assertEqual(page_size_for({'page_size': bad}), 20, bad)

    def test_ceiling_is_large_enough_for_selectors(self):
        self.assertGreaterEqual(StandardResultsSetPagination.max_page_size, 1000)
