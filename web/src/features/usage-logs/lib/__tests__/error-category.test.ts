import { expect, test } from 'vitest'

import { getStatusCodeVariant, resolveErrorCategory } from '../error-category'

test.each([
  [
    'gateway quota rejection',
    {
      error_type: 'new_api_error',
      error_code: 'insufficient_user_quota',
      status_code: 403,
    },
    'request_rejected',
  ],
  [
    'model not found',
    {
      error_type: 'new_api_error',
      error_code: 'model_not_found',
      status_code: 404,
    },
    'request_rejected',
  ],
  [
    'violation fee code family',
    {
      error_type: 'new_api_error',
      error_code: 'violation_fee.grok.csam',
      status_code: 400,
    },
    'request_rejected',
  ],
  [
    'upstream openai error type',
    {
      error_type: 'openai_error',
      error_code: 'bad_response_status_code',
      status_code: 429,
    },
    'upstream_failed',
  ],
  [
    'channel key problem',
    {
      error_type: 'new_api_error',
      error_code: 'channel:invalid_key',
      status_code: 401,
    },
    'upstream_failed',
  ],
  [
    'upstream request failed',
    {
      error_type: 'new_api_error',
      error_code: 'do_request_failed',
      status_code: 502,
    },
    'upstream_failed',
  ],
  [
    'gateway internal failure',
    {
      error_type: 'new_api_error',
      error_code: 'json_marshal_failed',
      status_code: 500,
    },
    'system_error',
  ],
] as const)('classifies %s', (_name, other, expected) => {
  expect(resolveErrorCategory(other)).toBe(expected)
})

test('legacy error logs without error fields fall back to the status code', () => {
  expect(resolveErrorCategory({ status_code: 503 })).toBe('system_error')
  expect(resolveErrorCategory({ status_code: 400 })).toBe('request_rejected')
})

test('a consume log without error information has no category', () => {
  expect(resolveErrorCategory({ model_ratio: 1 })).toBeNull()
  expect(resolveErrorCategory(null)).toBeNull()
})

test('status code badge variant follows the HTTP class', () => {
  expect(getStatusCodeVariant(500)).toBe('danger')
  expect(getStatusCodeVariant(403)).toBe('warning')
  expect(getStatusCodeVariant(200)).toBe('success')
})
