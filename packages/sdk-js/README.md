# @zoplio/sdk-js

Official Zoplio Node.js/TypeScript SDK for the [Zoplio API v1](https://github.com/Zoplio/zoplio-sdk/blob/main/docs/quickstart.md). MIT licensed.

Zoplio schedules meetings for you: you say who to invite and roughly when, Zoplio negotiates with every invitee over WhatsApp/email and confirms a slot.

Requires Node.js >= 18 (uses the global `fetch`).

## Install

```bash
npm i @zoplio/sdk-js
```

## Get an API key

Sign in at [zoplio.com/dashboard/api](https://zoplio.com/dashboard/api) with Google, go to **API keys** and click **Create key**. Keys start with `zpl_`; copy yours right away, it is shown once. The free plan covers 3 confirmed meetings and 15 meeting requests per calendar month (UTC).

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

// Create a meeting. You are the organizer; Zoplio invites Jana. With no date
// fields Zoplio proposes free working-day slots over the next week.
const created = await zoplio.scheduleMeeting(
  {
    title: 'Intro call',
    durationMinutes: 30,
    participants: [{ phone: '+15555550100', name: 'Jana' }], // fictional number: use a real one
  },
  { idempotencyKey: 'order-42-intro-call' }, // optional, safe retries
);
console.log(created.meetingId, created.status, created.proposedSlots);

// Somebody who told Zoplio to stop contacting them is never invited. The
// meeting is still created with the rest of the list, so check this before
// you report who it is with; both fields are absent when everybody went in.
if (created.skippedParticipants?.length) {
  console.log(created.skippedMessage, created.skippedParticipants);
  // -> [{ name: 'Jana', reason: 'opted_out' }]
}

// Poll status (or use webhooks instead). Each entry of meeting.participants
// carries status, attending and role ('organizer' | 'participant').
const meeting = await zoplio.getMeeting(created.meetingId);

// List / reschedule / cancel.
await zoplio.listMeetings({ status: 'confirmed', limit: 10 });
await zoplio.rescheduleMeeting(
  created.meetingId,
  { preferredDate: nextWeekday(4), preferredTime: '10:00', timezone: 'Europe/Prague' }, // next Thursday
  { idempotencyKey: 'order-42-intro-call-move-1' }, // a retry replays instead of opening another round
);
await zoplio.cancelMeeting(created.meetingId); // frees the slot on the free plan

// Plan and this month's usage: { plan, month, confirmed, creates, limits: { confirmed, creates } }
const usage = await zoplio.getUsage();

/** The next given weekday (0 = Sunday ... 6 = Saturday) after today, as YYYY-MM-DD. */
function nextWeekday(weekday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + (((weekday - d.getDay() + 7) % 7) || 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
```

An exact time: send `preferredDate` + `preferredTime` + `timezone`, and Jana gets a yes/no for that one slot:

```ts
await zoplio.scheduleMeeting({
  title: 'Intro call',
  participants: [{ phone: '+15555550100', name: 'Jana' }],
  preferredDate: nextWeekday(3), // next Wednesday
  preferredTime: '14:00',
  timezone: 'Europe/Prague', // always send it with preferredTime
});
```

On behalf of someone else: set `organizer`. Petr is then the organizer (his calendar and timezone; Zoplio tells him the meeting is being arranged and again once it confirms) and Jana is invited:

```ts
await zoplio.scheduleMeeting({
  title: 'Intro call',
  organizer: { email: 'petr@example.com', name: 'Petr' },
  participants: [{ phone: '+15555550100', name: 'Jana' }],
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

`quota_exceeded` (HTTP 402) means your account's free-plan limit was reached this calendar month, the same limits as for any Zoplio user: 3 confirmed meetings and 15 meeting requests per calendar month (UTC). Meetings still being arranged count against the 3 until they confirm or fall through; `err.message` says which limit it was. `zoplio.getUsage()` shows where you stand, and cancelling a meeting that is still being arranged frees its slot.

`rate_limited` (HTTP 429) means more than 60 requests/min for this key. The response carries a `Retry-After` header (seconds); wait that long before retrying, since throttled requests still count toward the window.

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

Verify deliveries with the static helper over the RAW request body, then dedupe: delivery is at-least-once and a retry carries the same `X-Zoplio-Delivery-Id` (also the body's `id`).

```ts
import express from 'express';
import { ZoplioClient, type WebhookDeliveryBody } from '@zoplio/sdk-js';

const app = express();
const seen = new Set<string>(); // use your database in production

app.post('/zoplio-hook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-zoplio-signature']; // string | string[] | undefined
  const ok = ZoplioClient.verifyWebhookSignature(
    req.body as Buffer,                        // raw bytes
    typeof signature === 'string' ? signature : '',
    process.env.ZOPLIO_WEBHOOK_SECRET!,        // whsec_...
  );
  if (!ok) return res.status(401).end();

  const delivery = JSON.parse((req.body as Buffer).toString('utf8')) as WebhookDeliveryBody;
  if (delivery.id && seen.has(delivery.id)) return res.status(200).end(); // a retry: already handled
  if (delivery.id) seen.add(delivery.id);
  // delivery.event also arrives in the X-Zoplio-Event header
  res.status(200).end();
});
```

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # unit tests (node:test via tsx)
npm run build       # emit dist/
```
