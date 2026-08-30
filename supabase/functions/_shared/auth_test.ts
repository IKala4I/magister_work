import { assertEquals } from '@std/assert';
import { constantTimeEqual, serviceKeyMatches } from './auth.ts';

Deno.test('constantTimeEqual: equal / unequal / different lengths', () => {
  assertEquals(constantTimeEqual('abc', 'abc'), true);
  assertEquals(constantTimeEqual('abc', 'abd'), false);
  assertEquals(constantTimeEqual('abc', 'ab'), false);
  assertEquals(constantTimeEqual('', ''), true);
});

Deno.test('serviceKeyMatches: an empty or missing key on either side never authorizes', () => {
  assertEquals(serviceKeyMatches('k', 'k'), true);
  assertEquals(serviceKeyMatches('k', 'x'), false);
  assertEquals(serviceKeyMatches('', ''), false);
  assertEquals(serviceKeyMatches(null, ''), false);
  assertEquals(serviceKeyMatches('k', null), false);
  assertEquals(serviceKeyMatches('k', ''), false);
});
