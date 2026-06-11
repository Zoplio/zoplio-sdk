# @zoplio/sdk-js

Official Zoplio Node.js/TypeScript SDK for the [Zoplio API v1](../../docs/quickstart.md). MIT licensed.

Zoplio schedules meetings for you: you say who and roughly when, Zoplio negotiates with every participant over WhatsApp/email and confirms a slot.

Requires Node.js >= 18 (uses the global `fetch`).

## Install

Not yet published to npm — consumed from this monorepo. Build with `npm run build` in this package.

## Usage

```ts
import { ZoplioClient, ZoplioApiError } from '@zoplio/sdk-js';

const zoplio = new ZoplioClient({
  apiKey: process.env.ZOPLIO_API_KEY!, // zpl_...
  // baseUrl: 'https://api.zoplio.com'  (default)
});

// Create a meeting — Zoplio reaches out to participants and negotiates.
const created = await zoplio.scheduleMeeting(
  {
    title: 'Intro call',
    durationMinutes: 30,
    participants: [
      { email: 'petr@example.com', name: 'Petr' },
      { phone: '+420777123456', name: 'Jana' },
    ],
    preferredDate: '2026-06-15',
    preferredTime: '14:00',
    timezone: 'Europe/Prague',
  },
  { idempotencyKey: 'order-42-intro-call' }, // optional, safe retries
);
console.log(created.meetingId, created.status, created.proposedSlots);

// Poll status (or use webhooks instead).
const meeting = await zoplio.getMeeting(created.meetingId);

// List / reschedule / cancel.
await zoplio.listMeetings({ status: 'confirmed', limit: 10 });
await zoplio.rescheduleMeeting(created.meetingId, {
  preferredDate: '2026-06-16',
  preferredTime: '10:00',
  timezone: 'Europe/Prague',
});
await zoplio.cancelMeeting(created.meetingId);
```

## Errors

Every non-2xx response throws `ZoplioApiError` with the contract envelope:

```ts
try {
  await zoplio.getMeeting('nope');
} catch (err) {
  if (err instanceof ZoplioApiError) {
    err.status;  // 404
    err.code;    // 'not_found' | 'unauthorized' | 'rate_limited' | 'validation_failed' | 'conflict' | 'upstream_error'
    err.message; // human-readable
    err.details; // [{ field, message }] on validation_failed
  }
}
```

## Webhooks

```ts
// Subscribe — the secret is returned exactly once.
const hook = await zoplio.createWebhook({
  url: 'https://example.com/zoplio-hook',
  events: ['meeting.confirmed', 'meeting.cancelled'],
});
saveSecret(hook.secret); // whsec_...

await zoplio.listWebhooks();
await zoplio.deleteWebhook(hook.id);
```

Verify deliveries with the static helper — pass the RAW request body:

```ts
import express from 'express';

app.post('/zoplio-hook', express.raw({ type: 'application/json' }), (req, res) => {
  const ok = ZoplioClient.verifyWebhookSignature(
    req.body,                                  // raw Buffer
    req.header('X-Zoplio-Signature') ?? '',
    process.env.ZOPLIO_WEBHOOK_SECRET!,        // whsec_...
  );
  if (!ok) return res.status(401).end();
  const { event, payload, timestamp } = JSON.parse(req.body.toString('utf8'));
  // event also arrives in the X-Zoplio-Event header
  res.status(200).end();
});
```

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run build       # emit dist/
```
