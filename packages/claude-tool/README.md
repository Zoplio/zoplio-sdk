# @zoplio/claude-tool

Connect Claude to Zoplio. Zoplio is an AI scheduling agent: you tell it who to meet and roughly when, it negotiates with every participant over WhatsApp/email and confirms a slot. This package documents the Zoplio hosted MCP server so Claude (Claude Code, Claude Desktop, or any MCP client) can schedule real meetings.

> **Status:** the hosted MCP endpoint lives on the same gateway as REST API v1 (`/mcp`, Streamable HTTP, stateless) and exposes five meeting tools through the same service layer and the same `zpl_` API keys. Webhook management is REST/SDK-only. The [JS](../sdk-js/README.md)/[Python](../sdk-python/README.md) SDKs cover the full REST surface.

This package is not published to npm yet (publishing is a later phase); it is docs plus a tiny dependency-free config helper.

## Connect

You need a Zoplio API key (`zpl_...`). Zoplio is in private beta — request access at [zoplio.com](https://zoplio.com) (developer waitlist) and see the [API quickstart](../../docs/quickstart.md).

### Claude Code (CLI)

```bash
claude mcp add --transport http zoplio https://api.zoplio.com/mcp \
  --header "Authorization: Bearer zpl_YOUR_KEY"
```

### `.mcp.json` (checked into a project)

```json
{
  "mcpServers": {
    "zoplio": {
      "type": "http",
      "url": "https://api.zoplio.com/mcp",
      "headers": {
        "Authorization": "Bearer zpl_YOUR_KEY"
      }
    }
  }
}
```

### Config helper

```js
const { mcpServerConfig } = require('@zoplio/claude-tool');

// → { type: 'http', url: 'https://api.zoplio.com/mcp', headers: { Authorization: 'Bearer zpl_...' } }
mcpServerConfig(process.env.ZOPLIO_API_KEY);

// Point at a different gateway (e.g. a sandbox URL you were given):
mcpServerConfig(process.env.ZOPLIO_API_KEY, 'https://sandbox.example/mcp');
```

Authentication is the API key in the `Authorization` header — the MCP server acts as the key's user, exactly like the REST API. Rate limits (60 requests/min per key) apply.

## Tools

Each tool maps 1:1 to a Zoplio API v1 operation ([full schemas](../../docs/openapi.yaml)):

| Tool | REST operation | What it does |
|------|----------------|--------------|
| `schedule_meeting` | `POST /v1/meetings` | Create a meeting and start negotiating. Takes `participants` (1-8, each with E.164 `phone` or `email`, optional `name`), optional `title`, `durationMinutes` (default 30), `preferredDate`/`preferredTime` + `timezone`, `earliestDate`/`latestDate`, `openAsk`, `location`, `organizerAttending`. Returns `meetingId`, `negotiationId`, `status`, `proposedSlots`. |
| `get_meeting_status` | `GET /v1/meetings/:id` | Status of one meeting incl. per-participant accept/decline state and the confirmed slot. |
| `list_meetings` | `GET /v1/meetings` | The user's meetings, newest first. Optional `status` filter (`negotiating`, `confirmed`, `cancelled`, ...) and `limit` (max 50). |
| `cancel_meeting` | `POST /v1/meetings/:id/cancel` | Cancel a meeting. Participants are notified. |
| `reschedule_meeting` | `POST /v1/meetings/:id/reschedule` | Propose a new exact `preferredDate` + `preferredTime` (+ `timezone`) to all participants. |

Webhook management (`POST/GET/DELETE /v1/webhooks` — `meeting.created`, `meeting.confirmed`, `meeting.cancelled`, `negotiation.failed`, HMAC-signed deliveries) is available via REST and the SDKs; it is an integration concern, not an in-conversation agent action.

Zoplio does the scheduling work asynchronously: `schedule_meeting` returns immediately with `status: "negotiating"` while Zoplio messages the participants. Check back later with `get_meeting_status`, or register a webhook for `meeting.confirmed`.

## Example conversation

> **You:** Set up 30 minutes with Petr (petr@example.com) and Jana (+420 777 123 456) on Monday afternoon, Prague time. Call it "Roadmap sync".
>
> **Claude:** I'll schedule that through Zoplio.
>
> *[tool: `schedule_meeting` — `{"title": "Roadmap sync", "durationMinutes": 30, "participants": [{"email": "petr@example.com", "name": "Petr"}, {"phone": "+420777123456", "name": "Jana"}], "preferredDate": "2026-06-15", "preferredTime": "14:00", "timezone": "Europe/Prague"}`]*
>
> *[result: `{"meetingId": "6650f1...", "negotiationId": "6650f2...", "status": "negotiating", "proposedSlots": [{"start": "2026-06-15T12:00:00.000Z", "end": "2026-06-15T12:30:00.000Z"}]}`]*
>
> **Claude:** Done — Zoplio proposed Monday June 15 at 14:00 (Prague) and is now reaching out to Petr and Jana to confirm. I'll check the status whenever you ask.
>
> **You:** *(later)* Did they confirm?
>
> *[tool: `get_meeting_status` — `{"meetingId": "6650f1..."}`]*
>
> *[result: `{"id": "6650f1...", "title": "Roadmap sync", "status": "confirmed", "confirmedSlot": {"start": "2026-06-15T12:00:00.000Z", "end": "2026-06-15T12:30:00.000Z"}, "participants": [{"name": "Petr", "email": "petr@example.com", "status": "accepted", "attending": true}, {"name": "Jana", "phone": "+420777123456", "status": "accepted", "attending": true}]}`]*
>
> **Claude:** Yes — both Petr and Jana accepted. "Roadmap sync" is confirmed for Monday June 15, 14:00-14:30 Prague time.

## Errors

Tool failures carry the REST error contract: a `code` (`unauthorized`, `rate_limited`, `validation_failed`, `not_found`, `conflict`, `upstream_error`) and a human-readable `message`. `conflict` on `reschedule_meeting` means the requested time collides with a participant's availability — pick another time.
