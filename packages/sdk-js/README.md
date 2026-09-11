# @zoplio/sdk-js

Official Zoplio Node.js/TypeScript SDK for the [Zoplio API v1](../../docs/quickstart.md). MIT licensed.

Zoplio schedules meetings for you: you say who to invite and roughly when, Zoplio negotiates with every invitee over WhatsApp/email and confirms a slot.

Requires Node.js >= 18 (uses the global `fetch`).

## Install

```bash
npm i @zoplio/sdk-js
```

## Roles

The account that owns the API key is the organizer. `participants` are the people Zoplio invites. To arrange a meeting for someone else, set `organizer`.

- You are a Zoplio user like anyone on WhatsApp: a meeting you create runs on your calendar, in your timezone and working hours, Zoplio tells you when the invitees answer, and it counts against your plan.
- Every participant (1-8) is invited; one is enough. Your own number or e-mail as a participant is rejected with `validation_failed`.
- `organizer` is the optional on-behalf mode (an agency booking for a client): that person is then the organizer, every participant is still invited, and the meeting still bills to your account.

## Usage

```ts
import { ZoplioClient, ZoplioApiError } from '@zoplio/sdk-js';

const zoplio = new ZoplioClient({
  apiKey: process.env.ZOPLIO_API_KEY!, // zpl_...
  // baseUrl: 'https://api.zoplio.com'  (default)
});

// Create a meeting. You are the organizer; Zoplio invites Jana.
const created = await zoplio.scheduleMeeting(
  {
    title: 'Intro call',
    durationMinutes: 30,
    participants: [{ phone: '+420777123456', name: 'Jana' }],
    preferredDate: '2026-09-16',
    preferredTime: '14:00',
    timezone: 'Europe/Prague', // always send it with preferredTime
  },
  { idempotencyKey: 'order-42-intro-call' }, // optional, safe retries
);
console.log(created.meetingId, created.status, created.proposedSlots);

// Poll status (or use webhooks instead). Each entry of meeting.participants
// carries status, attending and role ('organizer' | 'participant').
const meeting = await zoplio.getMeeting(created.meetingId);

// List / reschedule / cancel.
await zoplio.listMeetings({ status: 'confirmed', limit: 10 });
await zoplio.rescheduleMeeting(
  created.meetingId,
  { preferredDate: '2026-09-17', preferredTime: '10:00', timezone: 'Europe/Prague' },
  { idempotencyKey: 'order-42-intro-call-move-1' }, // a retry replays instead of opening another round
);
await zoplio.cancelMeeting(created.meetingId);
```

On behalf of someone else: set `organizer`. Petr is then the organizer (his calendar and timezone; Zoplio tells him the meeting is being arranged and again once it confirms) and Jana is invited:

```ts
await zoplio.scheduleMeeting({
  title: 'Intro call',
  organizer: { email: 'petr@example.com', name: 'Petr' },
  participants: [{ phone: '+420777123456', name: 'Jana' }],
  preferredDate: '2026-09-16',
  preferredTime: '14:00',
  timezone: 'Europe/Prague',
});
```

Scheduling mode is picked by the date fields you send: exact (`preferredDate` + `preferredTime` + `timezone`), day (`preferredDate` only), range (`earliestDate` + `latestDate`) or open ask (`openAsk: true` plus the window). With no date fields Zoplio proposes one slot per working day over the next seven days at the start of the organizer's working hours (09:00 by default), rendered in each invitee's own timezone.

## Errors

Every non-2xx response throws `ZoplioApiError` with the contract envelope:

```ts
try {
  await zoplio.getMeeting('nope');
} catch (err) {
  if (err instanceof ZoplioApiError) {
    err.status;  // 404
    err.code;    // 'not_found' | 'unauthorized' | 'rate_limited' | 'validation_failed' | 'conflict' | 'quota_exceeded' | 'upstream_error'
    err.message; // human-readable
    err.details; // [{ field, message }] on validation_failed
  }
}
```

`quota_exceeded` (HTTP 402) means your account's free-plan limit was reached this calendar month, the same limits as for any Zoplio user: 3 confirmed meetings and 15 meeting requests per calendar month (UTC). Meetings still being arranged count against the 3 until they confirm or fall through; `err.message` says which limit it was.

## Webhooks

```ts
// Subscribe. The secret is returned exactly once.
const hook = await zoplio.createWebhook({
  url: 'https://example.com/zoplio-hook',
  events: ['meeting.confirmed', 'meeting.rescheduled', 'meeting.cancelled'],
  // omit `events` for all five: meeting.created, meeting.confirmed,
  // meeting.cancelled, meeting.rescheduled, negotiation.failed
});
saveSecret(hook.secret); // whsec_...

await zoplio.listWebhooks();
await zoplio.deleteWebhook(hook.id);
```

`meeting.rescheduled` fires the moment a confirmed meeting re-opens to move; its payload carries `previousSlot`, and a fresh `meeting.confirmed` (or a cancellation) follows when the renegotiation resolves.

Verify deliveries with the static helper. Pass the RAW request body:

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
npm test            # unit tests (node:test via tsx)
npm run build       # emit dist/
```
