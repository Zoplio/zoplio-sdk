// Pins the SDK against the gateway/webhooks contract without any network:
// - verifyWebhookSignature must match the webhooks service's pinned HMAC
//   vectors (apps/webhooks/src/services/__tests__/webhookSignature.test.ts)
//   EXACTLY — a drift here breaks every consumer integration.
// - request plumbing: auth header, idempotency header, error-envelope parsing.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ZoplioApiError, ZoplioClient } from '../client';

describe('verifyWebhookSignature — pinned vectors (must match webhooks service)', () => {
  const secret = 'whsec_0123456789abcdef0123456789abcdef0123456789abcdef';
  const body = JSON.stringify({
    event: 'meeting.confirmed',
    payload: { meetingId: 'meet_1', title: 'Standup' },
    timestamp: '2026-06-11T08:00:00.000Z',
  });
  const sig = '700d795ed0445ce5a1fb659ef36f540684c5595b2818f96368e4d7062a1f9433';

  it('accepts the known-good vector (string body)', () => {
    assert.equal(ZoplioClient.verifyWebhookSignature(body, sig, secret), true);
  });

  it('accepts the known-good vector (raw bytes body)', () => {
    assert.equal(
      ZoplioClient.verifyWebhookSignature(Buffer.from(body, 'utf8'), sig, secret),
      true,
    );
  });

  it('accepts a second independent vector', () => {
    assert.equal(
      ZoplioClient.verifyWebhookSignature(
        'x',
        '3099d2505a6c71e7e386c934ad0b6110cd96451bc237a4fbda1df43e34e138e0',
        'whsec_other',
      ),
      true,
    );
  });

  it('tolerates uppercase/whitespace in the header', () => {
    assert.equal(ZoplioClient.verifyWebhookSignature(body, ` ${sig.toUpperCase()} `, secret), true);
  });

  it('rejects a tampered body, wrong secret, and empty inputs', () => {
    assert.equal(ZoplioClient.verifyWebhookSignature(`${body}x`, sig, secret), false);
    assert.equal(ZoplioClient.verifyWebhookSignature(body, sig, 'whsec_wrong'), false);
    assert.equal(ZoplioClient.verifyWebhookSignature(body, '', secret), false);
    assert.equal(ZoplioClient.verifyWebhookSignature(body, sig, ''), false);
  });
});

describe('ZoplioClient request plumbing', () => {
  const realFetch = globalThis.fetch;
  let calls: Array<{ url: string; init: RequestInit | undefined }>;
  let nextResponse: { status: number; body: unknown };

  beforeEach(() => {
    calls = [];
    nextResponse = { status: 200, body: {} };
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(nextResponse.body), {
        status: nextResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('requires an apiKey', () => {
    assert.throws(() => new ZoplioClient({ apiKey: '' }), /apiKey/);
  });

  it('sends bearer auth + idempotency header and hits POST /v1/meetings', async () => {
    const client = new ZoplioClient({ apiKey: 'zpl_abc', baseUrl: 'https://api.example.com/' });
    nextResponse = {
      status: 201,
      body: { meetingId: 'm1', negotiationId: 'n1', status: 'negotiating', proposedSlots: [] },
    };
    const result = await client.scheduleMeeting(
      { participants: [{ email: 'a@b.cz' }] },
      { idempotencyKey: 'key-1' },
    );
    assert.equal(result.meetingId, 'm1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.example.com/v1/meetings');
    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer zpl_abc');
    assert.equal(headers['X-Idempotency-Key'], 'key-1');
    assert.equal(calls[0].init?.method, 'POST');
  });

  it('builds list query strings and URI-encodes path ids', async () => {
    const client = new ZoplioClient({ apiKey: 'zpl_abc', baseUrl: 'https://api.example.com' });
    nextResponse = { status: 200, body: { meetings: [] } };
    await client.listMeetings({ status: 'confirmed', limit: 5 });
    assert.equal(calls[0].url, 'https://api.example.com/v1/meetings?status=confirmed&limit=5');

    nextResponse = { status: 200, body: { id: 'x', title: 't', status: 'confirmed', participants: [] } };
    await client.getMeeting('a/b');
    assert.equal(calls[1].url, 'https://api.example.com/v1/meetings/a%2Fb');
  });

  it('throws ZoplioApiError carrying the contract error envelope', async () => {
    const client = new ZoplioClient({ apiKey: 'zpl_abc', baseUrl: 'https://api.example.com' });
    nextResponse = {
      status: 400,
      body: {
        error: {
          code: 'validation_failed',
          message: 'participants: must be a non-empty array (1-8 entries)',
          details: [{ field: 'participants', message: 'must be a non-empty array (1-8 entries)' }],
        },
      },
    };
    await assert.rejects(
      client.scheduleMeeting({ participants: [] }),
      (err: unknown) => {
        assert.ok(err instanceof ZoplioApiError);
        assert.equal(err.status, 400);
        assert.equal(err.code, 'validation_failed');
        assert.equal(err.details?.[0]?.field, 'participants');
        return true;
      },
    );
  });

  it('falls back to upstream_error when the body is not the envelope', async () => {
    const client = new ZoplioClient({ apiKey: 'zpl_abc', baseUrl: 'https://api.example.com' });
    nextResponse = { status: 502, body: 'bad gateway' };
    await assert.rejects(client.listWebhooks(), (err: unknown) => {
      assert.ok(err instanceof ZoplioApiError);
      assert.equal(err.status, 502);
      assert.equal(err.code, 'upstream_error');
      return true;
    });
  });
});
