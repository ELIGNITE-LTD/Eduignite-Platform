// Run with: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { accreditationState, buildWhatsAppLink, parseAccreditation, whatsappDigits } from './school-site-extras';

test('whatsappDigits keeps digits and rejects implausible numbers', () => {
  assert.equal(whatsappDigits('+237 670 00 00 00'), '237670000000');
  assert.equal(whatsappDigits('12'), '');
  assert.equal(whatsappDigits(''), '');
  assert.equal(whatsappDigits(null), '');
});

test('buildWhatsAppLink builds a wa.me link with an encoded bilingual message', () => {
  const en = buildWhatsAppLink('237670000000', 'Univ & Co', 'en');
  assert.equal(en, 'https://wa.me/237670000000?text=' + encodeURIComponent('Hello, I am interested in admission to Univ & Co.'));
  const fr = buildWhatsAppLink('+237670000000', "Ecole d'Art", 'fr');
  assert.ok(fr?.startsWith('https://wa.me/237670000000?text=Bonjour'));
  assert.ok(!fr?.includes(' '));
  assert.equal(buildWhatsAppLink('', 'X', 'en'), null);
});

test('accreditation is verified only when the flag is exactly true and a level is set', () => {
  assert.equal(accreditationState(parseAccreditation({ level: 'none', verified: true })), 'hidden');
  assert.equal(accreditationState(parseAccreditation({ level: 'approved', verified: false })), 'declared');
  assert.equal(accreditationState(parseAccreditation({ level: 'approved', verified: 'true' })), 'declared');
  assert.equal(accreditationState(parseAccreditation({ level: 'approved', verified: true })), 'verified');
  assert.equal(accreditationState(parseAccreditation(undefined)), 'hidden');
  assert.equal(parseAccreditation({ level: 'bogus' }).level, 'none');
});
