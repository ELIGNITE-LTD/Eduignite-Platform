import os
import urllib.error
from unittest.mock import patch

from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APISimpleTestCase

from .translationService import TranslationProviderError, apply_system_terms


class LibreTranslateServiceUnitTests(APISimpleTestCase):
    def test_system_terms_are_enforced_after_translation(self):
        translated = apply_system_terms(
            'Open the Dashboard Settings',
            'Ouvrir les réglages du Dashboard',
            'fr',
        )

        self.assertEqual(translated, 'Ouvrir les réglages du Tableau de bord')


class LibreTranslateApiIntegrationTests(APISimpleTestCase):
    def setUp(self):
        cache.clear()

    @patch.dict(os.environ, {'LIBRETRANSLATE_URL': 'http://localhost:5000'}, clear=False)
    @patch('apps.config.translationService._perform_libretranslate_request')
    def test_successful_translation_uses_libretranslate_and_detects_source_language(self, libre_request):
        libre_request.return_value = {
            'translatedText': 'Bienvenue dans votre tableau de bord',
            'detectedLanguage': {'language': 'en'},
        }

        response = self.client.post(
            '/api/translate',
            {
                'text': 'Welcome to your dashboard',
                'targetLang': 'fr',
            },
            format='json',
            secure=True,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['translatedText'], 'Bienvenue dans votre tableau de bord')
        self.assertEqual(response.data['sourceLang'], 'en')
        self.assertEqual(response.data['targetLang'], 'fr')
        self.assertEqual(response.data['provider'], 'LibreTranslate')
        self.assertFalse(response.data['cached'])
        libre_request.assert_called_once_with('Welcome to your dashboard', 'fr', None)

    @patch.dict(os.environ, {'LIBRETRANSLATE_URL': 'http://localhost:5000'}, clear=False)
    def test_invalid_input_is_rejected(self):
        empty_response = self.client.post(
            '/api/translate',
            {
                'text': '',
                'targetLang': 'fr',
                'sourceLang': 'en',
            },
            format='json',
            secure=True,
        )
        unsupported_language_response = self.client.post(
            '/api/translate',
            {
                'text': 'Welcome',
                'targetLang': 'es',
                'sourceLang': 'en',
            },
            format='json',
            secure=True,
        )

        self.assertEqual(empty_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(empty_response.data['detail'], 'text cannot be empty.')
        self.assertEqual(unsupported_language_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(unsupported_language_response.data['detail'], 'targetLang must be en or fr.')

    @patch.dict(os.environ, {'LIBRETRANSLATE_URL': ''}, clear=False)
    @patch('apps.config.translationService._perform_libretranslate_request')
    def test_provider_failure_returns_local_fallback_without_503(self, libre_request):
        libre_request.side_effect = TranslationProviderError('LibreTranslate is temporarily unavailable. Please try again.')

        response = self.client.post(
            '/api/translate',
            {
                'text': 'Open the Dashboard Settings',
                'targetLang': 'fr',
                'sourceLang': 'en',
            },
            format='json',
            secure=True,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['translatedText'], 'Open the Tableau de bord Paramètres')
        self.assertTrue(response.data['fallback'])

    @patch.dict(os.environ, {'LIBRETRANSLATE_URL': 'http://localhost:5000'}, clear=False)
    @patch('apps.config.translationService._perform_libretranslate_request')
    def test_cache_hit_does_not_call_libretranslate_twice(self, libre_request):
        libre_request.return_value = {
            'translatedText': 'Bienvenue',
            'detectedLanguage': {'language': 'en'},
        }
        payload = {
            'text': 'Welcome',
            'targetLang': 'fr',
            'sourceLang': 'en',
        }

        first_response = self.client.post('/api/translate', payload, format='json', secure=True)
        second_response = self.client.post('/api/translate', payload, format='json', secure=True)

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(first_response.data['translatedText'], 'Bienvenue')
        self.assertEqual(second_response.data['translatedText'], 'Bienvenue')
        self.assertFalse(first_response.data['cached'])
        self.assertTrue(second_response.data['cached'])
        libre_request.assert_called_once()

    @patch.dict(os.environ, {'LIBRETRANSLATE_URL': 'http://localhost:5000'}, clear=False)
    @patch('urllib.request.urlopen')
    def test_libretranslate_request_retries_before_success(self, urlopen_mock):
        from .translationService import _perform_libretranslate_request

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

            def read(self):
                return b'{"translatedText":"Bonjour","detectedLanguage":{"language":"en"}}'

        urlopen_mock.side_effect = [
            urllib.error.URLError('temporary failure'),
            FakeResponse(),
        ]

        result = _perform_libretranslate_request('Hello', 'fr', 'en')

        self.assertEqual(result['translatedText'], 'Bonjour')
        self.assertEqual(urlopen_mock.call_count, 2)
