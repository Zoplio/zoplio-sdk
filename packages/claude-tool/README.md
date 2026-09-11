# @zoplio/claude-tool

Connect Claude to Zoplio. Zoplio is an AI scheduling agent: you tell it who to invite and roughly when, it negotiates with every invitee over WhatsApp/email and confirms a slot. This package documents the Zoplio hosted MCP server so Claude (Claude Code, Claude Desktop, or any MCP client) can schedule real meetings.

> **Status:** the hosted MCP endpoint lives on the same gateway as REST API v1 (`/mcp`, Streamable HTTP, stateless) and exposes five meeting tools through the same service layer and the same `zpl_` API keys. Webhook management is REST/SDK-only. The [JS](../sdk-js/README.md)/[Python](../sdk-python/README.md) SDKs cover the full REST surface.

## Install

```bash
npm i @zoplio/claude-tool
```

The package is docs plus a tiny dependency-free config helper; you can also just copy the config below.

## Connect

You need a Zoplio API key (`zpl_...`). In production, mint one in the dashboard at [zoplio.com](https://zoplio.com). On a development environment the provisioning call needs an `X-Provision-Secret` header, which the Zoplio team hands out (see the [API quickstart](../../docs/quickstart.md#1-get-an-api-key)).

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

// -> { type: 'http', url: 'https://api.zoplio.com/mcp', headers: { Authorization: 'Bearer zpl_...' } }
mcpServerConfig(process.env.ZOPLIO_API_KEY);

// Point at a different gateway (for example an evaluation URL you were given):
mcpServerConfig(process.env.ZOPLIO_API_KEY, 'https://your-gateway.example/mcp');
```

Authentication is the API key in the `Authorization` header. The key is your Zoplio account: Claude acts for you, exactly as if you wrote to Zoplio on WhatsApp (see Roles below). Rate limits apply: 60 requests/min per key, plus a shared per-IP ceiling of 300 requests/min.

## Roles

The account that owns the API key is the organizer. `participants` are the people Zoplio invites. To arrange a meeting for someone else, set `organizer`.

The server tells Claude the same thing at connect time: "You act for the account that owns the API key: that account is the organizer. participants are the people to invite. Set organizer only when arranging a meeting for someone else." So for "set up a call with Alex", Claude lists Alex as the only participant and the meeting runs on your calendar, in your timezone and working hours; Zoplio tells you when Alex answers, and the meeting counts against your plan like any other. One participant is enough. Your own number or e-mail as a participant is rejected with `validation_failed` ("That is your own number/e-mail. Add the people you want to meet as participants.").

`organizer` is the on-behalf mode (an assistant booking for their manager, an agency for a client): that person is then the organizer (their calendar and timezone; Zoplio tells them the meeting is being arranged and again when it confirms), every participant is still invited, and the meeting still bills to your account.

## Tools

Each tool maps 1:1 to a Zoplio API v1 operation ([full schemas](../../docs/openapi.yaml)):

| Tool | REST operation | What it does |
|------|----------------|--------------|
| `schedule_meeting` | `POST /v1/meetings` | Create a meeting and start negotiating. Takes `participants` (1-8 people to invite, each an E.164 `phone` or `email` plus optional `name`; one is enough), optional `organizer` (on-behalf mode: the person the meeting is for when it is not you), optional `title`, `durationMinutes` (default 30), `preferredDate`/`preferredTime` + `timezone` (always send `timezone` with a time), `earliestDate`/`latestDate`, `openAsk`, `location`, `organizerAttending`. Returns `meetingId`, `negotiationId`, `status`, `proposedSlots`. |
| `get_meeting_status` | `GET /v1/meetings/:id` | Status of one meeting incl. each person's accept/decline state, their `role` (`organizer` or `participant`) and the confirmed slot. |
| `list_meetings` | `GET /v1/meetings` | Meetings you created with this key, newest first. Optional `status` filter (`negotiating`, `confirmed`, `cancelled`, ...) and `limit` (max 50). |
| `cancel_meeting` | `POST /v1/meetings/:id/cancel` | Cancel a meeting you created. Zoplio tells the invitees (and the on-behalf organizer, if any). |
| `reschedule_meeting` | `POST /v1/meetings/:id/reschedule` | Propose a new exact `preferredDate` + `preferredTime` (+ `timezone`) to all participants. An identical repeat (same meeting, date, time and timezone) is replayed instead of opening another negotiation round; a different time is a new round, and exhausting the round limit cancels the meeting. |

Scheduling mode is picked by the date fields: exact (`preferredDate` + `preferredTime` + `timezone`, a yes/no for one slot), day (`preferredDate` only, the organizer's free slots that day), range (`earliestDate` + `latestDate`, free working-day slots across the window) or open ask (`openAsk: true` plus the window, Zoplio asks each participant what suits them). With no date fields at all Zoplio proposes one slot per working day over the next seven days at the start of the organizer's working hours (09:00 by default), shown to each invitee in their own timezone, so a 09:00 Prague slot reads as 03:00 in New York. Prefer `earliestDate`/`latestDate` on working days unless the user asks for weekends. Always send `timezone` with a time: without it the time is read in the organizer's stored timezone, which is your account's zone (UTC for an account Zoplio has only seen by e-mail, such as a dev-provisioned key) or, for an on-behalf `organizer`, the phone's country zone or UTC for an e-mail contact.

Webhook management (`POST/GET/DELETE /v1/webhooks`; events `meeting.created`, `meeting.confirmed`, `meeting.cancelled`, `meeting.rescheduled`, `negotiation.failed`; HMAC-signed deliveries) is available via REST and the SDKs; it is an integration concern, not an in-conversation agent action.

Zoplio does the scheduling work asynchronously: `schedule_meeting` returns immediately with `status: "negotiating"` while Zoplio messages the participants. Check back later with `get_meeting_status`, or register a webhook for `meeting.confirmed`.

## Example conversation

> **You:** Set up 30 minutes with Jana (+420 777 123 456) on Wednesday afternoon, Prague time. Call it "Roadmap sync".
>
> **Claude:** I'll schedule that through Zoplio.
>
> *[tool: `schedule_meeting`: `{"title": "Roadmap sync", "durationMinutes": 30, "participants": [{"phone": "+420777123456", "name": "Jana"}], "preferredDate": "2026-09-16", "preferredTime": "14:00", "timezone": "Europe/Prague"}`]*
>
> *[result: `{"meetingId": "6650f1...", "negotiationId": "6650f2...", "status": "negotiating", "proposedSlots": [{"start": "2026-09-16T12:00:00.000Z", "end": "2026-09-16T12:30:00.000Z"}]}`]*
>
> **Claude:** Done. Zoplio proposed Wednesday September 16 at 14:00 (Prague) and is now reaching out to Jana; the meeting is on your calendar and Zoplio will tell you when she answers. I'll check the status whenever you ask.
>
> **You:** *(later)* Did she confirm?
>
> *[tool: `get_meeting_status`: `{"meetingId": "6650f1..."}`]*
>
> *[result: `{"id": "6650f1...", "title": "Roadmap sync", "status": "confirmed", "confirmedSlot": {"start": "2026-09-16T12:00:00.000Z", "end": "2026-09-16T12:30:00.000Z"}, "participants": [{"name": "You", "email": "you@example.com", "status": "accepted", "attending": true, "role": "organizer"}, {"name": "Jana", "phone": "+420777123456", "status": "accepted", "attending": true, "role": "participant"}]}`]*
>
> **Claude:** Yes, Jana accepted. "Roadmap sync" is confirmed for Wednesday September 16, 14:00-14:30 Prague time.

For a meeting that is not yours ("book my manager Petr a call with Jana"), Claude adds `"organizer": {"email": "petr@example.com", "name": "Petr"}` to the same call: Petr is then the organizer and Jana the invitee.

## Errors

Tool failures carry the REST error contract: a `code` (`unauthorized`, `rate_limited`, `validation_failed`, `not_found`, `conflict`, `quota_exceeded`, `upstream_error`) and a human-readable `message`. `conflict` on `reschedule_meeting` means the requested time collides with a participant's availability; pick another time. `quota_exceeded` (HTTP 402) means your account's free-plan limit was reached this calendar month, the same limits as for any Zoplio user: 3 confirmed meetings and 15 meeting requests per calendar month (UTC); meetings still being arranged count against the 3 until they confirm or fall through, and the `message` says which limit it was.
