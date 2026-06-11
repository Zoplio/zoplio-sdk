# Zoplio API v1 — Quickstart

Base URL: `https://api.zoplio.com` (private-beta testers may receive a different gateway URL — every example below works the same way, just swap the host).

## 1. Get an API key

Zoplio is in private beta. Request developer access at [zoplio.com](https://zoplio.com); you'll receive an API key in the form `zpl_<hex>`.

Every `/v1` request sends it as a bearer token:

```
Authorization: Bearer zpl_YOUR_KEY
```

Rate limit: 60 requests/min per key (`X-RateLimit-Limit` / `X-RateLimit-Remaining` headers; `429` with error code `rate_limited` when exceeded). Errors always use the envelope `{"error": {"code", "message"}}`.

## 2. Create a meeting

```bash
curl -X POST https://api.zoplio.com/v1/meetings \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: my-req-001" \
  -d '{
    "title": "Intro call",
    "durationMinutes": 30,
    "participants": [
      { "phone": "+420777123456", "name": "Jana" },
      { "email": "petr@example.com", "name": "Petr" }
    ],
    "preferredDate": "2026-06-22",
    "preferredTime": "14:00",
    "timezone": "Europe/Prague"
  }'
```

```json
{ "meetingId": "…", "negotiationId": "…", "status": "negotiating", "proposedSlots": [{ "start": "…", "end": "…" }] }
```

Zoplio's agent now contacts each participant (WhatsApp for phones, email for addresses), negotiates counters and reminders, and confirms. The work is asynchronous — `X-Idempotency-Key` makes retries safe (same key ⇒ same meeting).

Scheduling modes: exact (`preferredDate`+`preferredTime`), day-flex (`preferredDate` only), range (`earliestDate`+`latestDate`), or `openAsk: true` (ask participants what works). `organizerAttending: false` schedules a meeting *between* the participants without you (proxy scheduling).

## 3. Check status

```bash
curl -s https://api.zoplio.com/v1/meetings/$MEETING_ID -H "Authorization: Bearer $ZOPLIO_API_KEY"
```

`status` walks `negotiating → confirmed | cancelled`; `participants[]` carries per-person `status` (`pending/accepted/declined/counter-proposed`) and `attending`. List with `GET /v1/meetings?status=confirmed&limit=20`, cancel with `POST /v1/meetings/:id/cancel`, move with `POST /v1/meetings/:id/reschedule {"preferredDate","preferredTime","timezone"}`.

## 4. Webhooks (recommended over polling)

```bash
curl -X POST https://api.zoplio.com/v1/webhooks \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://your.app/zoplio-webhook", "events": ["meeting.created", "meeting.confirmed", "meeting.cancelled", "negotiation.failed"] }'
```

The response contains the signing `secret` (`whsec_…`) — **shown once**. Deliveries are `POST {event, payload, timestamp}` with headers `X-Zoplio-Event` and `X-Zoplio-Signature` (lowercase-hex HMAC-SHA256 of the raw body). Verify with the SDK helpers or 10 lines of crypto — see [examples/webhook-receiver](../examples/webhook-receiver). Failed deliveries retry after 1 m and 5 m; subscriptions auto-disable after 10 consecutive failures.

## 5. SDKs

**Node/TypeScript** ([packages/sdk-js](../packages/sdk-js)):

```ts
import { ZoplioClient } from '@zoplio/sdk-js';
const zoplio = new ZoplioClient({ apiKey: process.env.ZOPLIO_API_KEY });
const meeting = await zoplio.scheduleMeeting({ title: 'Sync', participants: [{ email: 'a@b.c' }] });
```

**Python** ([packages/sdk-python](../packages/sdk-python)):

```python
from zoplio import ZoplioClient
zoplio = ZoplioClient(api_key=os.environ["ZOPLIO_API_KEY"])
meeting = zoplio.schedule_meeting(title="Sync", participants=[{"email": "a@b.c"}])
```

## 6. MCP — let agents schedule

Zoplio's hosted MCP server lives at `/mcp` (Streamable HTTP, same key, same rate limit) with five tools: `schedule_meeting`, `get_meeting_status`, `list_meetings`, `cancel_meeting`, `reschedule_meeting`. Setup for Claude Code / Claude Desktop: [packages/claude-tool](../packages/claude-tool).

## Reference

Full surface incl. schemas and webhook payloads: [openapi.yaml](openapi.yaml).
