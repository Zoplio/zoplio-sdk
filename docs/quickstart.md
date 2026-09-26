# Zoplio API v1: Quickstart

Zoplio is an AI scheduling agent. You tell it who to invite and roughly when; it negotiates with every invitee over WhatsApp/email and confirms a slot. The API is asynchronous by design: creating a meeting returns immediately with `status: "negotiating"` while the agent talks to the invitees. Poll the meeting or subscribe to webhooks for the confirmation.

- Base URL: `https://api.zoplio.com`
- Auth: `Authorization: Bearer zpl_<hex>` on every `/v1` route
- Full reference: [`openapi.yaml`](openapi.yaml)
- SDKs: [JavaScript/TypeScript](https://github.com/Zoplio/zoplio-sdk/tree/main/packages/sdk-js) (`npm i @zoplio/sdk-js`) · [Python](https://github.com/Zoplio/zoplio-sdk/tree/main/packages/sdk-python) (`pip install zoplio`) · [Claude / MCP](https://github.com/Zoplio/zoplio-sdk/tree/main/packages/claude-tool)

## Roles: you, participants, organizer

The account that owns the API key is the organizer. `participants` are the people Zoplio invites. To arrange a meeting for someone else, set `organizer`.

- **You** are the account the key belongs to, a Zoplio user like anyone on WhatsApp. A meeting you create runs on your calendar, in your timezone and working hours; Zoplio tells you when the invitees answer and the meeting counts against your plan.
- **`participants`** (1 to 8) are all invited, and one is enough. Listing your own number or e-mail as a participant answers `400 validation_failed` ("That is your own number/e-mail. Add the people you want to meet as participants.").
- **`organizer`** (optional) is the on-behalf mode for an agency or an assistant booking for someone else: that person is then the organizer (their calendar and timezone), every participant is still invited (their own contact as a participant is rejected the same way), Zoplio tells them a meeting is being arranged and again when it confirms, and the meeting still bills to your account.

## 1. Get an API key

1. Sign in at [zoplio.com/dashboard/api](https://zoplio.com/dashboard/api) with Google.
2. Under **API keys**, click **Create key**.
3. Copy the key right away: it is shown once. Keys start with `zpl_`.

```bash
export ZOPLIO_API_KEY=zpl_YOUR_KEY
```

The free plan covers **3 confirmed meetings and 15 meeting requests per calendar month (UTC)**, no card required. Meetings still being arranged count against the 3 until they confirm or fall through, so while you test, cancel meetings you no longer need (`POST /v1/meetings/{id}/cancel`) to free their slot. `GET /v1/usage` shows what is left (see [Usage](#3-usage)).

Evaluation testers the Zoplio team gave a separate gateway URL: swap the host in the examples, everything else is the same.

## 2. Create a meeting

You are the organizer, so one participant is enough. With no date fields Zoplio proposes free working-day slots over the next week, which makes this the quickest first call:

```bash
curl -s -X POST https://api.zoplio.com/v1/meetings \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: my-first-meeting-1' \
  -d '{
    "title": "Intro call",
    "durationMinutes": 30,
    "participants": [{"phone": "+15555550100", "name": "Jana"}]
  }'
# -> 201 {"meetingId": "...", "negotiationId": "...", "status": "negotiating",
#         "proposedSlots": [{"start": "...", "end": "..."}, ...]}
```

Use a real number or e-mail (yours on a second phone, a colleague's) to watch the negotiation happen; `+15555550100` is a fictional placeholder. Zoplio contacts each participant (WhatsApp for phones, e-mail for addresses), negotiates counters and reminders, and confirms. The meeting runs on your calendar and Zoplio tells you once it is booked (WhatsApp or e-mail, like any Zoplio user). `X-Idempotency-Key` (1 to 128 chars) makes retries safe: the same key returns the meeting it originally created instead of duplicating it.

Check progress:

```bash
curl -s https://api.zoplio.com/v1/meetings/$MEETING_ID \
  -H "Authorization: Bearer $ZOPLIO_API_KEY"
# -> {"id": "...", "title": "Intro call", "status": "confirmed",
#     "confirmedSlot": {"start": "...", "end": "..."},
#     "participants": [{"name": "You", "email": "you@example.com", "status": "accepted", "attending": true, "role": "organizer"},
#                      {"name": "Jana", "phone": "+15555550100", "status": "accepted", "attending": true, "role": "participant"}]}
```

`status` walks `negotiating` to `confirmed` or `cancelled`. Every entry of `participants[]` carries a per-person `status` (`pending` / `accepted` / `declined` / `counter-proposed`), `attending`, and `role`, which is `organizer` or `participant`.

### Scheduling modes

Which date fields you send picks the mode:

| Mode | Fields | What invitees get |
|------|--------|-------------------|
| Exact | `preferredDate` + `preferredTime` + `timezone` | A yes/no for that one slot |
| Day | `preferredDate` only | The organizer's free slots on that day (a weekend is honoured when you name one) |
| Range | `earliestDate` + `latestDate` | Free working-day slots across the window |
| Open ask | `openAsk: true` (plus `earliestDate`/`latestDate` as the window) | A question about what time suits them, no slots proposed |

With no date fields at all, Zoplio looks at the seven days from tomorrow and, with a free calendar, proposes one slot per working day at the start of the organizer's working hours (09:00 unless they set otherwise; weekends excluded). Slots are shown to each invitee in their own timezone, so a 09:00 Prague slot reads as 03:00 in New York. Prefer `earliestDate`/`latestDate` on working days unless the user asks for weekends.

An exact time a week from today (dates are `YYYY-MM-DD`; the one-liner computes it portably):

```bash
DATE=$(python3 -c 'import datetime; print(datetime.date.today() + datetime.timedelta(days=7))')
curl -s -X POST https://api.zoplio.com/v1/meetings \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" -H 'Content-Type: application/json' \
  -d '{
    "title": "Intro call",
    "participants": [{"phone": "+15555550100", "name": "Jana"}],
    "preferredDate": "'"$DATE"'",
    "preferredTime": "14:00",
    "timezone": "Europe/Prague"
  }'
```

`organizerAttending: false` schedules a meeting *between* the participants without you (list at least two of them).

### On behalf of someone else

Set `organizer` when the meeting is for another person (an agency booking for a client, an assistant for their manager). Petr is then the organizer and Jana the invitee; Petr hears from Zoplio that the meeting is being arranged and again once it confirms. It still bills to your account:

```bash
curl -s -X POST https://api.zoplio.com/v1/meetings \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" -H 'Content-Type: application/json' \
  -d '{
    "title": "Intro call",
    "organizer": {"email": "petr@example.com", "name": "Petr"},
    "participants": [{"phone": "+15555550100", "name": "Jana"}]
  }'
```

### Somebody who asked Zoplio to stop writing to them

Anyone can tell Zoplio to stop contacting them ("unsubscribe", "nepiste mi") on any channel, and that decision is theirs, not the organizer's: it holds account-wide and outlives every meeting. They are dropped before anything is sent, whoever books the meeting and through whichever API.

The meeting is still created with the rest of the list, so this stays a normal `201`. The people left out are named in `skippedParticipants`, with the sentence to show the organizer in `skippedMessage`:

```bash
# -> 201 {"meetingId": "...", "negotiationId": "...", "status": "negotiating",
#         "proposedSlots": [...],
#         "skippedParticipants": [{"name": "Jana", "reason": "opted_out"}],
#         "skippedMessage": "<one sentence, in the organizer's language, naming Jana and why>"}
```

Read the field before you tell anyone who was invited. Each entry names the person the way Zoplio knows them (`name`); `email` / `phone` appear only when Zoplio knows the contact is exactly the one you sent, so match on `name` rather than expecting your request entry back. `reason` is an open string: `opted_out` is the only value today, and an unknown value still means "not invited". Both fields are absent when everybody was invited, which is the usual case.

If every person on the list has opted out there is nobody to invite and the call fails with `400` `validation_failed`, carrying the same sentence as its message.

### Timezone

Always send `timezone` together with `preferredTime`. Without it Zoplio reads the time in the organizer's stored timezone. For you that is your account's timezone: the zone Zoplio already knows for you (a WhatsApp account's phone country zone, or the browser zone captured when you signed in on the dashboard), or UTC for an account Zoplio has only seen by e-mail. For an on-behalf `organizer` it is the phone's country zone for a phone contact and UTC for an e-mail contact. A caller who omits it and sends `14:00` from a UTC account books 16:00 Prague.

### List, reschedule, cancel

```bash
# list (meetings you created with this key, including on-behalf ones): ?status=negotiating|confirmed|cancelled|... &limit=1..50
curl -s "https://api.zoplio.com/v1/meetings?status=confirmed&limit=10" -H "Authorization: Bearer $ZOPLIO_API_KEY"

# reschedule to an exact time (409 conflict if a participant can't make it).
# Send X-Idempotency-Key: a blind retry without it opens another negotiation round.
DATE=$(python3 -c 'import datetime; print(datetime.date.today() + datetime.timedelta(days=8))')
curl -s -X POST https://api.zoplio.com/v1/meetings/$MEETING_ID/reschedule \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: my-first-meeting-1-move-1' \
  -d '{"preferredDate": "'"$DATE"'", "preferredTime": "10:00", "timezone": "Europe/Prague"}'

# cancel (idempotent; frees the slot on the free plan while the meeting is still being arranged)
curl -s -X POST https://api.zoplio.com/v1/meetings/$MEETING_ID/cancel -H "Authorization: Bearer $ZOPLIO_API_KEY"
```

## 3. Usage

```bash
curl -s https://api.zoplio.com/v1/usage -H "Authorization: Bearer $ZOPLIO_API_KEY"
# -> {"plan": "free", "month": "2027-09", "confirmed": 1, "creates": 4,
#     "limits": {"confirmed": 3, "creates": 15}, ...}
```

`month` is the UTC month the counts cover (`YYYY-MM`). A `null` limit means uncapped (any plan other than `free`). `limits.confirmed` already includes referral and purchased credits. On the free plan a new meeting answers `402 quota_exceeded` once `confirmed` reaches `limits.confirmed`, once confirmed meetings plus meetings still being arranged fill it, or once `creates` reaches `limits.creates`.

## 4. SDKs

JavaScript/TypeScript ([`@zoplio/sdk-js`](https://github.com/Zoplio/zoplio-sdk/tree/main/packages/sdk-js), `npm i @zoplio/sdk-js`):

```ts
import { ZoplioClient } from '@zoplio/sdk-js';

const zoplio = new ZoplioClient({ apiKey: process.env.ZOPLIO_API_KEY! });

// No date fields: Zoplio proposes free working-day slots over the next week.
const created = await zoplio.scheduleMeeting({
  title: 'Intro call',
  participants: [{ phone: '+15555550100', name: 'Jana' }],
});
const meeting = await zoplio.getMeeting(created.meetingId);
const usage = await zoplio.getUsage();
```

Python ([`zoplio`](https://github.com/Zoplio/zoplio-sdk/tree/main/packages/sdk-python), `pip install zoplio`):

```python
import os

from zoplio import ZoplioClient

zoplio = ZoplioClient(api_key=os.environ["ZOPLIO_API_KEY"])

# No date fields: Zoplio proposes free working-day slots over the next week.
created = zoplio.schedule_meeting(
    participants=[{"phone": "+15555550100", "name": "Jana"}],
    title="Intro call",
)
meeting = zoplio.get_meeting(created["meetingId"])
usage = zoplio.get_usage()
```

Both take `organizer` for the on-behalf mode (`organizer: { email: 'petr@example.com', name: 'Petr' }` / `organizer={"email": "petr@example.com", "name": "Petr"}`), and both READMEs show an exact-time booking with the date computed from today.

## 5. Webhooks (recommended over polling)

Subscribe a public https URL to `meeting.created`, `meeting.confirmed`, `meeting.cancelled`, `meeting.rescheduled`, `negotiation.failed` (omit `events` for all five). The host is DNS-resolved and validated at subscribe time: `http` URLs, hosts that do not resolve (the `your.app` placeholder below included, until you swap in your own host) and private/internal hosts answer `400 validation_failed`.

```bash
curl -s -X POST https://api.zoplio.com/v1/webhooks \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" -H 'Content-Type: application/json' \
  -d '{"url": "https://your.app/zoplio-webhook", "events": ["meeting.confirmed", "meeting.rescheduled", "meeting.cancelled"]}'
# -> 201 {"id": "...", "url": "...", "events": [...], "secret": "whsec_..."}   secret shown ONCE
```

Deliveries are `POST {"id", "event", "payload", "timestamp"}` with three headers:

- `X-Zoplio-Event`: the event name
- `X-Zoplio-Signature`: lowercase-hex HMAC-SHA256 of the **raw request body**, keyed with your `whsec_` secret
- `X-Zoplio-Delivery-Id`: the stable id of the event, equal to the body's `id`

Deliveries are at-least-once: a retry, or a redelivery after a timeout, carries the same `X-Zoplio-Delivery-Id`, so store the ids you have processed and skip repeats. `timestamp` is fresh on every attempt, so do not dedupe on it.

`payload` always carries `meetingId`, `organizerUserId` and `billingAccountId` (the account that owns the API key; equals `organizerUserId` unless the meeting was arranged on behalf of someone else). `meeting.confirmed` adds `confirmedSlot`. `meeting.rescheduled` fires the moment a confirmed meeting re-opens to move: its payload carries `previousSlot` (the slot the meeting left) and no `confirmedSlot`, and a fresh `meeting.confirmed` (or a cancellation) follows when the renegotiation resolves. The per-event fields are in [openapi.yaml](openapi.yaml).

Verify over the raw bytes (both SDKs ship a helper: `ZoplioClient.verifyWebhookSignature(rawBody, signatureHeader, secret)` / `ZoplioClient.verify_webhook_signature(...)`; a runnable receiver is in [examples/webhook-receiver](https://github.com/Zoplio/zoplio-sdk/tree/main/examples/webhook-receiver)) and respond 2xx within 10 s. Failed deliveries are retried up to 2 more times (1 m / 5 m backoff); a subscription is disabled after 10 consecutive failures. `GET /v1/webhooks` lists subscriptions (no secrets), `DELETE /v1/webhooks/{id}` removes one.

## 6. MCP: let agents schedule

Zoplio's hosted MCP server lives at `https://api.zoplio.com/mcp` (Streamable HTTP, stateless, same key and rate limit as REST) with five tools: `schedule_meeting`, `get_meeting_status`, `list_meetings`, `cancel_meeting`, `reschedule_meeting`. The agent acts for the account that owns the key, so "set up 30 minutes with Jana on Wednesday afternoon" invites Jana to a meeting on your calendar.

Claude Code:

```bash
claude mcp add --transport http zoplio https://api.zoplio.com/mcp \
  --header "Authorization: Bearer $ZOPLIO_API_KEY"
```

Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "zoplio": {
      "url": "https://api.zoplio.com/mcp",
      "headers": { "Authorization": "Bearer ${env:ZOPLIO_API_KEY}" }
    }
  }
}
```

Claude Desktop, a checked-in `.mcp.json`, and raw `initialize` / `tools/list` calls with curl: see [`@zoplio/claude-tool`](https://github.com/Zoplio/zoplio-sdk/tree/main/packages/claude-tool#connect).

## Errors, quotas, rate limits, idempotency

- Every non-2xx response is `{"error": {"code", "message", "details"?}}` with `code` one of `unauthorized`, `rate_limited`, `validation_failed`, `not_found`, `conflict`, `quota_exceeded`, `upstream_error`. `validation_failed` includes per-field `details`.
- Expired or inactive keys get HTTP 403 (code stays `unauthorized`); unknown keys get 401. A 503 means the auth backend is down: retry, your key is not necessarily bad.
- Quotas are your account's, the same as for a WhatsApp user. Free plan: 3 confirmed meetings and 15 meeting requests per calendar month (UTC). Meetings still being arranged count against the 3 until they confirm or fall through. `402` with code `quota_exceeded` when a limit is reached; the `message` says which one. `GET /v1/usage` shows where you stand.
- Rate limits: 60 requests/min per key, sliding window, shared by REST and MCP. Responses carry `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Over the limit you get `429` with code `rate_limited` and a `Retry-After` header (seconds to wait); throttled requests still count toward the window, so back off rather than retry in a loop. A shared per-IP ceiling of 300 requests/min applies across all keys.
- `POST /v1/meetings` honors `X-Idempotency-Key` (1-128 chars): replaying the same key returns the originally created meeting instead of duplicating it. `POST /v1/meetings/{id}/reschedule` honors the same header: a replay returns the original proposal instead of opening another negotiation round, and rescheduling without a key is not safe to retry blindly.
- Meeting ids you do not own answer 404: they are indistinguishable from non-existent ids.
