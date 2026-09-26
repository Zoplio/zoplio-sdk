# @zoplio/claude-tool

Connect Claude, Cursor or any MCP client to Zoplio. Zoplio is an AI scheduling agent: you tell it who to invite and roughly when, it negotiates with every invitee over WhatsApp/email and confirms a slot. Zoplio runs a hosted MCP server at `https://api.zoplio.com/mcp` (Streamable HTTP, stateless) with five meeting tools behind the same `zpl_` API keys as REST API v1.

This package is documentation plus a tiny dependency-free config helper (`mcpServerConfig`). It has no CLI and you do not need to install it to connect: the configs below are all you need. Webhook management is REST/SDK-only; the [JS](https://github.com/Zoplio/zoplio-sdk/tree/main/packages/sdk-js) and [Python](https://github.com/Zoplio/zoplio-sdk/tree/main/packages/sdk-python) SDKs cover the full REST surface.

## Get an API key

Sign in at [zoplio.com/dashboard/api](https://zoplio.com/dashboard/api) with Google, go to **API keys** and click **Create key**. Keys start with `zpl_`. Copy it right away: it is shown once. The free plan covers 3 confirmed meetings and 15 meeting requests per calendar month (UTC).

The examples read the key from `ZOPLIO_API_KEY`:

```bash
export ZOPLIO_API_KEY=zpl_YOUR_KEY
```

## Connect

### Claude Code

```bash
claude mcp add --transport http zoplio https://api.zoplio.com/mcp \
  --header "Authorization: Bearer $ZOPLIO_API_KEY"
```

Or check a `.mcp.json` into a project (Claude Code expands `${ZOPLIO_API_KEY}` from the environment, so the key stays out of git):

```json
{
  "mcpServers": {
    "zoplio": {
      "type": "http",
      "url": "https://api.zoplio.com/mcp",
      "headers": {
        "Authorization": "Bearer ${ZOPLIO_API_KEY}"
      }
    }
  }
}
```

### Cursor

`.cursor/mcp.json` in the project (or `~/.cursor/mcp.json` for every project):

```json
{
  "mcpServers": {
    "zoplio": {
      "url": "https://api.zoplio.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:ZOPLIO_API_KEY}"
      }
    }
  }
}
```

### Claude Desktop

On individual plans, bridge the remote server through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) (needs Node.js). Add this to `claude_desktop_config.json` (Settings > Developer > Edit Config) and restart Claude Desktop:

```json
{
  "mcpServers": {
    "zoplio": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://api.zoplio.com/mcp",
        "--header",
        "Authorization:${ZOPLIO_AUTH_HEADER}"
      ],
      "env": {
        "ZOPLIO_AUTH_HEADER": "Bearer zpl_YOUR_KEY"
      }
    }
  }
}
```

The header value lives in `env` and there is no space inside `args` on purpose: Claude Desktop on Windows does not escape spaces in `args`.

On Team and Enterprise plans, an organization owner can instead add Zoplio as a custom connector (URL `https://api.zoplio.com/mcp`, no sign-in, request header `Authorization: Bearer zpl_...`). Request headers on custom connectors are a beta feature of Claude; if the connector does not come up, use the `mcp-remote` config above.

### Any MCP client, or curl

The endpoint speaks plain JSON-RPC over HTTP POST. Send `Accept: application/json, text/event-stream` (Streamable HTTP requires both):

```bash
# initialize
curl -s https://api.zoplio.com/mcp \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

# list the tools (the server is stateless: no session id to carry over)
curl -s https://api.zoplio.com/mcp \
  -H "Authorization: Bearer $ZOPLIO_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### Config helper

```js
const { mcpServerConfig } = require('@zoplio/claude-tool');

// -> { type: 'http', url: 'https://api.zoplio.com/mcp', headers: { Authorization: 'Bearer zpl_...' } }
mcpServerConfig(process.env.ZOPLIO_API_KEY);

// Point at a different gateway (for example an evaluation URL you were given):
mcpServerConfig(process.env.ZOPLIO_API_KEY, 'https://your-gateway.example/mcp');
```

Authentication is the API key in the `Authorization` header. The key is your Zoplio account: Claude acts for you, exactly as if you wrote to Zoplio on WhatsApp (see Roles below). MCP calls share the key's REST budget: 60 requests/min per key, plus a shared per-IP ceiling of 300 requests/min.

## Roles

The account that owns the API key is the organizer. `participants` are the people Zoplio invites. To arrange a meeting for someone else, set `organizer`.

The server tells Claude the same thing at connect time: "You act for the account that owns the API key: that account is the organizer. participants are the people to invite. Set organizer only when arranging a meeting for someone else." So for "set up a call with Alex", Claude lists Alex as the only participant and the meeting runs on your calendar, in your timezone and working hours; Zoplio tells you when Alex answers, and the meeting counts against your plan like any other. One participant is enough. Your own number or e-mail as a participant is rejected with `validation_failed` ("That is your own number/e-mail. Add the people you want to meet as participants.").

`organizer` is the on-behalf mode (an assistant booking for their manager, an agency for a client): that person is then the organizer (their calendar and timezone; Zoplio tells them the meeting is being arranged and again when it confirms), every participant is still invited, and the meeting still bills to your account.

## Tools

Each tool maps 1:1 to a Zoplio API v1 operation ([full schemas](https://github.com/Zoplio/zoplio-sdk/blob/main/docs/openapi.yaml)):

| Tool | REST operation | What it does |
|------|----------------|--------------|
| `schedule_meeting` | `POST /v1/meetings` | Create a meeting and start negotiating. Takes `participants` (1-8 people to invite, each an E.164 `phone` or `email` plus optional `name`; one is enough), optional `organizer` (on-behalf mode: the person the meeting is for when it is not you), optional `title`, `durationMinutes` (default 30), `preferredDate`/`preferredTime` + `timezone` (always send `timezone` with a time), `earliestDate`/`latestDate`, `openAsk`, `location`, `organizerAttending`. Returns `meetingId`, `negotiationId`, `status`, `proposedSlots`. |
| `get_meeting_status` | `GET /v1/meetings/:id` | Status of one meeting incl. each person's accept/decline state, their `role` (`organizer` or `participant`) and the confirmed slot. |
| `list_meetings` | `GET /v1/meetings` | Meetings you created with this key, newest first. Optional `status` filter (`negotiating`, `confirmed`, `cancelled`, ...) and `limit` (max 50). |
| `cancel_meeting` | `POST /v1/meetings/:id/cancel` | Cancel a meeting you created. Zoplio tells the invitees. |
| `reschedule_meeting` | `POST /v1/meetings/:id/reschedule` | Propose a new exact `preferredDate` + `preferredTime` (+ `timezone`) to all participants. An identical repeat (same meeting, date, time and timezone) is replayed instead of opening another negotiation round; a different time is a new round, and exhausting the round limit cancels the meeting. |

Scheduling mode is picked by the date fields: exact (`preferredDate` + `preferredTime` + `timezone`, a yes/no for one slot), day (`preferredDate` only, the organizer's free slots that day), range (`earliestDate` + `latestDate`, free working-day slots across the window) or open ask (`openAsk: true` plus the window, Zoplio asks each participant what suits them). With no date fields at all Zoplio proposes one slot per working day over the next seven days at the start of the organizer's working hours (09:00 by default), shown to each invitee in their own timezone, so a 09:00 Prague slot reads as 03:00 in New York. Prefer `earliestDate`/`latestDate` on working days unless the user asks for weekends. Always send `timezone` with a time: without it the time is read in the organizer's stored timezone, which is your account's zone (UTC for an account Zoplio has only seen by e-mail) or, for an on-behalf `organizer`, the phone's country zone or UTC for an e-mail contact.

Webhook management (`POST/GET/DELETE /v1/webhooks`; events `meeting.created`, `meeting.confirmed`, `meeting.cancelled`, `meeting.rescheduled`, `negotiation.failed`; HMAC-signed deliveries) is available via REST and the SDKs; it is an integration concern, not an in-conversation agent action.

Zoplio does the scheduling work asynchronously: `schedule_meeting` returns immediately with `status: "negotiating"` while Zoplio messages the participants. Check back later with `get_meeting_status`, or register a webhook for `meeting.confirmed`.

## Example conversation

> **You:** Set up 30 minutes with Jana (+1 555 555 0100) on Wednesday afternoon, Prague time. Call it "Roadmap sync".
>
> **Claude:** I'll schedule that through Zoplio.
>
> *[tool: `schedule_meeting`: `{"title": "Roadmap sync", "durationMinutes": 30, "participants": [{"phone": "+15555550100", "name": "Jana"}], "preferredDate": "2027-09-15", "preferredTime": "14:00", "timezone": "Europe/Prague"}`]*
>
> *[result: `{"meetingId": "6650f1...", "negotiationId": "6650f2...", "status": "negotiating", "proposedSlots": [{"start": "2027-09-15T12:00:00.000Z", "end": "2027-09-15T12:30:00.000Z"}]}`]*
>
> **Claude:** Done. Zoplio proposed Wednesday September 15 at 14:00 (Prague) and is now reaching out to Jana; the meeting is on your calendar and Zoplio will tell you when she answers. I'll check the status whenever you ask.
>
> **You:** *(later)* Did she confirm?
>
> *[tool: `get_meeting_status`: `{"meetingId": "6650f1..."}`]*
>
> *[result: `{"id": "6650f1...", "title": "Roadmap sync", "status": "confirmed", "confirmedSlot": {"start": "2027-09-15T12:00:00.000Z", "end": "2027-09-15T12:30:00.000Z"}, "participants": [{"name": "You", "email": "you@example.com", "status": "accepted", "attending": true, "role": "organizer"}, {"name": "Jana", "phone": "+15555550100", "status": "accepted", "attending": true, "role": "participant"}]}`]*
>
> **Claude:** Yes, Jana accepted. "Roadmap sync" is confirmed for Wednesday September 15, 14:00-14:30 Prague time.

For a meeting that is not yours ("book my manager Petr a call with Jana"), Claude adds `"organizer": {"email": "petr@example.com", "name": "Petr"}` to the same call: Petr is then the organizer and Jana the invitee.

## Errors

Tool failures carry the REST error contract: a `code` (`unauthorized`, `rate_limited`, `validation_failed`, `not_found`, `conflict`, `quota_exceeded`, `upstream_error`) and a human-readable `message`. `conflict` on `reschedule_meeting` means the requested time collides with a participant's availability; pick another time. `quota_exceeded` (HTTP 402) means your account's free-plan limit was reached this calendar month, the same limits as for any Zoplio user: 3 confirmed meetings and 15 meeting requests per calendar month (UTC); meetings still being arranged count against the 3 until they confirm or fall through, and the `message` says which limit it was. `GET /v1/usage` (or the dashboard) shows what is left, and cancelling a test meeting that is still being arranged frees its slot.
