// Pins the SDK against the gateway/webhooks contract without any network:
// - verifyWebhookSignature must match the webhooks service's pinned HMAC
//   vectors (apps/webhooks/src/services/__tests__/webhookSignature.test.ts)
//   EXACTLY: a drift here breaks every consumer integration.
// - request plumbing: auth header, idempotency header, error-envelope parsing.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ZoplioApiError, ZoplioClient } from '../client';
import type { MeetingParticipant, ScheduleMeetingParams, WebhookEvent } from '../types';

describe('verifyWebhookSignature: pinned vectors (must match webhooks service)', () => {
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
    // One participant and no organizer: the key owner is the organizer
    // server-side, so the SDK sends exactly what it was given.
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
    const sent = JSON.parse(String(calls[0].init?.body));
    assert.deepEqual(sent, { participants: [{ email: 'a@b.cz' }] });
    assert.equal('organizer' in sent, false);
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

  it('sends organizer (on-behalf mode) as a first-class body field on POST /v1/meetings', async () => {
    const client = new ZoplioClient({ apiKey: 'zpl_abc', baseUrl: 'https://api.example.com' });
    nextResponse = {
      status: 201,
      body: { meetingId: 'm1', negotiationId: 'n1', status: 'negotiating', proposedSlots: [] },
    };
    // Typed literal: an excess-property error here would mean `organizer`
    // fell out of ScheduleMeetingParams again (P1-CONTRACT-01).
    const params: ScheduleMeetingParams = {
      title: 'Intro call',
      organizer: { email: 'petr@example.com', name: 'Petr' },
      participants: [{ phone: '+420777123456', name: 'Jana' }],
      preferredDate: '2026-09-16',
      preferredTime: '14:00',
      timezone: 'Europe/Prague',
    };
    await client.scheduleMeeting(params);
    const sent = JSON.parse(String(calls[0].init?.body));
    assert.deepEqual(sent.organizer, { email: 'petr@example.com', name: 'Petr' });
    assert.deepEqual(sent.participants, [{ phone: '+420777123456', name: 'Jana' }]);
    assert.equal(sent.timezone, 'Europe/Prague');
  });

  it('sends X-Idempotency-Key on reschedule only when options carry one', async () => {
    const client = new ZoplioClient({ apiKey: 'zpl_abc', baseUrl: 'https://api.example.com' });
    nextResponse = { status: 200, body: { meetingId: 'm1', status: 'negotiating', proposedSlots: [] } };
    const params = { preferredDate: '2026-09-17', preferredTime: '10:00', timezone: 'Europe/Prague' };

    await client.rescheduleMeeting('m1', params, { idempotencyKey: 'move-1' });
    assert.equal(calls[0].url, 'https://api.example.com/v1/meetings/m1/reschedule');
    assert.equal(calls[0].init?.method, 'POST');
    const keyed = calls[0].init?.headers as Record<string, string>;
    assert.equal(keyed['X-Idempotency-Key'], 'move-1');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), params);

    await client.rescheduleMeeting('m1', params);
    const unkeyed = calls[1].init?.headers as Record<string, string>;
    assert.equal('X-Idempotency-Key' in unkeyed, false);
  });

  it('surfaces each person\'s role on GET /v1/meetings/:id', async () => {
    const client = new ZoplioClient({ apiKey: 'zpl_abc', baseUrl: 'https://api.example.com' });
    // Typed literal: fails `tsc` if MeetingParticipant loses `role`.
    const organizer: MeetingParticipant = {
      name: 'You',
      email: 'you@example.com',
      status: 'accepted',
      attending: true,
      role: 'organizer',
    };
    const invitee: MeetingParticipant = {
      name: 'Jana',
      phone: '+420777123456',
      status: 'pending',
      attending: true,
      role: 'participant',
    };
    nextResponse = {
      status: 200,
      body: { id: 'm1', title: 'Intro call', status: 'negotiating', participants: [organizer, invitee] },
    };
    const detail = await client.getMeeting('m1');
    assert.deepEqual(
      detail.participants.map((p) => p.role),
      ['organizer', 'participant'],
    );
  });

  it('accepts meeting.rescheduled as a subscribable webhook event', async () => {
    const client = new ZoplioClient({ apiKey: 'zpl_abc', baseUrl: 'https://api.example.com' });
    nextResponse = {
      status: 201,
      body: { id: 'w1', url: 'https://example.com/hook', events: ['meeting.rescheduled'], secret: 'whsec_x' },
    };
    // Typed literal: this line fails `tsc` if WebhookEvent loses the fifth event (P1-WH-01).
    const events: WebhookEvent[] = ['meeting.rescheduled', 'meeting.confirmed'];
    const hook = await client.createWebhook({ url: 'https://example.com/hook', events });
    assert.equal(hook.secret, 'whsec_x');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)).events, events);
  });
});
