# Zoplio API v1: Quickstart

Base URL: `https://api.zoplio.com` (evaluation testers may receive a different gateway URL; every example below works the same way, just swap the host).

Zoplio is asynchronous by design: creating a meeting returns immediately with `status: "negotiating"` while the agent talks to the invitees. Poll the meeting or subscribe to webhooks for the confirmation.

## Roles: you, participants, organizer

The account that owns the API key is the organizer. `participants` are the people Zoplio invites. To arrange a meeting for someone else, set `organizer`.

- **You** are the account the key belongs to, a Zoplio user like anyone on WhatsApp. A meeting you create runs on your calendar, in your timezone and working hours; Zoplio tells you when the invitees answer and the meeting counts against your plan.
- **`participants`** (1 to 8) are all invited, and one is enough. Listing your own number or e-mail as a participant answers `400 validation_failed` ("That is your own number/e-mail. Add the people you want to meet as participants.").
- **`organizer`** (optional) is the on-behalf mode for an agency or an assistant booking for someone else: that person is then the organizer (their calendar and timezone), every participant is still invited, Zoplio tells them a meeting is being arranged and again when it confirms, and the meeting still bills to your account.

## 1. Get an API key

Mint an API key in the dashboard at [zoplio.com](https://zoplio.com); it has the form `zpl_<hex>`. Store it when it is shown: it is not retrievable later. On a development environment, self-provisioning also needs an `X-Provision-Secret` header, a secret the Zoplio team hands out; without it (or with a wrong one) the route answers 404, exactly like production.

Every `/v1` request sends the key as a bearer token:

```
Authorization: Bearer zpl_YOUR_KEY
```

Rate limits: 60 requests/min per key, sliding window (`X-RateLimit-Limit` / `X-RateLimit-Remaining` headers; `429` with error code `rate_limited` when exceeded, and throttled requests still count toward the window). A shared ceiling of 300 requests/min per IP applies across all keys, and the sign-in and key-provisioning routes allow 15 requests/min per IP. Errors always use the envelope `{"error": {"code", "message", "details"?}}`.

## 2. Create a meeting

You are the organizer, so one participant is enough:

```bash
curl -X POST https://api.zoplio.com/v1/meetings \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: my-req-001" \
  -d '{
    "title": "Intro call",
    "durationMinutes": 30,
    "participants": [
      { "phone": "+420777123456", "name": "Jana" }
    ],
    "preferredDate": "2026-09-16",
    "preferredTime": "14:00",
    "timezone": "Europe/Prague"
  }'
```

```json
{ "meetingId": "...", "negotiationId": "...", "status": "negotiating", "proposedSlots": [{ "start": "...", "end": "..." }] }
```

Zoplio's agent now contacts each participant (WhatsApp for phones, email for addresses), negotiates counters and reminders, and confirms. The meeting runs on your calendar and Zoplio tells you once it is booked. The work is asynchronous, and `X-Idempotency-Key` (1 to 128 chars) makes retries safe: the same key returns the meeting it originally created instead of duplicating it.

To arrange a meeting for someone else, add `organizer`. Petr is then the organizer and Jana the invitee; it still bills to your account:

```bash
curl -X POST https://api.zoplio.com/v1/meetings \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "title": "Intro call",
    "organizer": { "email": "petr@example.com", "name": "Petr" },
    "participants": [{ "phone": "+420777123456", "name": "Jana" }],
    "preferredDate": "2026-09-16",
    "preferredTime": "14:00",
    "timezone": "Europe/Prague"
  }'
```

### Scheduling modes

Which date fields you send picks the mode:

| Mode | Fields | What invitees get |
|------|--------|-------------------|
| Exact | `preferredDate` + `preferredTime` + `timezone` | A yes/no for that one slot |
| Day | `preferredDate` only | The organizer's free slots on that day |
| Range | `earliestDate` + `latestDate` | Free working-day slots across the window |
| Open ask | `openAsk: true` (plus `earliestDate`/`latestDate` as the window) | A question about what time suits them, no slots proposed |

With no date fields at all, Zoplio looks at the seven days from tomorrow and, with a free calendar, proposes one slot per working day at the start of the organizer's working hours (09:00 unless they set otherwise; weekends excluded). Slots are shown to each invitee in their own timezone, so a 09:00 Prague slot reads as 03:00 in New York. Prefer `earliestDate`/`latestDate` on working days unless the user asks for weekends.

`organizerAttending: false` schedules a meeting *between* the participants without you (proxy scheduling).

### Timezone

Always send `timezone` together with `preferredTime`. Without it Zoplio reads the time in the organizer's stored timezone: for you that is your account's zone (the zone Zoplio already knows for you, or UTC for an account Zoplio has only seen by e-mail), and for an on-behalf `organizer` it is the phone's country zone for a phone contact and UTC for an e-mail contact. A caller who omits it and sends `14:00` from a UTC account books 16:00 Prague.

## 3. Check status

```bash
curl -s https://api.zoplio.com/v1/meetings/$MEETING_ID -H "Authorization: Bearer $ZOPLIO_API_KEY"
```

`status` walks `negotiating` to `confirmed` or `cancelled`. Every entry of `participants[]` carries a per-person `status` (`pending` / `accepted` / `declined` / `counter-proposed`), `attending`, and `role`, which is `organizer` or `participant`:

```json
{ "id": "...", "title": "Intro call", "status": "confirmed",
  "confirmedSlot": { "start": "...", "end": "..." },
  "participants": [
    { "name": "You", "email": "you@example.com", "status": "accepted", "attending": true, "role": "organizer" },
    { "name": "Jana", "phone": "+420777123456", "status": "accepted", "attending": true, "role": "participant" }
  ] }
```

List with `GET /v1/meetings?status=confirmed&limit=20` and cancel with `POST /v1/meetings/:id/cancel` (idempotent). Move a meeting with `POST /v1/meetings/:id/reschedule`, which accepts the same idempotency header: a replay returns the original proposal instead of opening another negotiation round, so rescheduling without a key is not safe to retry blindly.

```bash
curl -X POST https://api.zoplio.com/v1/meetings/$MEETING_ID/reschedule \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: my-req-001-move-1" \
  -d '{ "preferredDate": "2026-09-17", "preferredTime": "10:00", "timezone": "Europe/Prague" }'
```

## 4. Webhooks (recommended over polling)

Five events are available: `meeting.created`, `meeting.confirmed`, `meeting.cancelled`, `meeting.rescheduled` and `negotiation.failed`. Omit `events` to subscribe to all five.

The `url` must be a public https URL. The host is DNS-resolved and validated at subscribe time: `http` URLs, hosts that do not resolve (the `your.app` placeholder below included, until you swap in your own host) and private/internal hosts answer `400 validation_failed`.

```bash
curl -X POST https://api.zoplio.com/v1/webhooks \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://your.app/zoplio-webhook", "events": ["meeting.created", "meeting.confirmed", "meeting.rescheduled", "meeting.cancelled", "negotiation.failed"] }'
```

The response contains the signing `secret` (`whsec_...`), **shown once**. Deliveries are `POST {event, payload, timestamp}` with headers `X-Zoplio-Event` and `X-Zoplio-Signature` (lowercase-hex HMAC-SHA256 of the raw body). `payload` always carries `meetingId`, `organizerUserId` and `billingAccountId` (the account that owns the API key; equals `organizerUserId` unless the meeting was arranged on behalf of someone else); the per-event fields are in [openapi.yaml](openapi.yaml). Verify with the SDK helpers or 10 lines of crypto; see [examples/webhook-receiver](../examples/webhook-receiver). Respond 2xx within 10s. Failed deliveries retry after 1 m and 5 m; subscriptions auto-disable after 10 consecutive failures.

`meeting.rescheduled` fires the moment a confirmed meeting re-opens to move; its payload carries `previousSlot`, and a fresh `meeting.confirmed` (or a cancellation) follows when the renegotiation resolves.

## 5. SDKs

**Node/TypeScript** ([packages/sdk-js](../packages/sdk-js), `npm i @zoplio/sdk-js`):

```ts
import { ZoplioClient } from '@zoplio/sdk-js';

const zoplio = new ZoplioClient({ apiKey: process.env.ZOPLIO_API_KEY! });
const created = await zoplio.scheduleMeeting({
  title: 'Intro call',
  participants: [{ phone: '+420777123456', name: 'Jana' }],
  preferredDate: '2026-09-16',
  preferredTime: '14:00',
  timezone: 'Europe/Prague',
});
const meeting = await zoplio.getMeeting(created.meetingId);
```

**Python** ([packages/sdk-python](../packages/sdk-python), `pip install zoplio`):

```python
import os

from zoplio import ZoplioClient

zoplio = ZoplioClient(api_key=os.environ["ZOPLIO_API_KEY"])
created = zoplio.schedule_meeting(
    participants=[{"phone": "+420777123456", "name": "Jana"}],
    title="Intro call",
    preferred_date="2026-09-16",
    preferred_time="14:00",
    timezone="Europe/Prague",
)
meeting = zoplio.get_meeting(created["meetingId"])
```

Both take `organizer` for the on-behalf mode (`organizer: { email: 'petr@example.com', name: 'Petr' }` / `organizer={"email": "petr@example.com", "name": "Petr"}`).

## 6. MCP: let agents schedule

Zoplio's hosted MCP server lives at `/mcp` (Streamable HTTP, same key, same rate limit) with five tools: `schedule_meeting`, `get_meeting_status`, `list_meetings`, `cancel_meeting`, `reschedule_meeting`. Claude then acts for the account that owns the key, so "set up 30 minutes with Jana on Wednesday afternoon" invites Jana to a meeting on your calendar. Setup for Claude Code / Claude Desktop: [packages/claude-tool](../packages/claude-tool), `npm i @zoplio/claude-tool`.

## Errors, quotas, idempotency

- Every non-2xx response is `{"error": {"code", "message", "details"?}}` with `code` one of `unauthorized`, `rate_limited`, `validation_failed`, `not_found`, `conflict`, `quota_exceeded`, `upstream_error`. `validation_failed` includes per-field `details`.
- Expired or inactive keys get HTTP 403 (code stays `unauthorized`); unknown keys get 401. A 503 means the auth backend is down: retry, your key is not necessarily bad.
- Quotas are your account's, the same as for a WhatsApp user. Free plan: 3 confirmed meetings and 15 meeting requests per calendar month (UTC). Meetings still being arranged count against the 3 until they confirm or fall through. `402` with code `quota_exceeded` when a limit is reached; the `message` says which one.
- Meeting ids you do not own answer 404: they are indistinguishable from non-existent ids.

## Reference

Full surface including schemas and webhook payloads: [openapi.yaml](openapi.yaml).
