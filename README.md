# Zoplio SDK

**Zoplio is an AI scheduling agent exposed as a hosted API.** You tell it who to invite and roughly when. Its agent reaches every invitee over WhatsApp or email, negotiates the back and forth ("can't do Tuesday, what about Wednesday 4pm?"), handles groups, holdouts and reschedules, and confirms a slot. One API call in, a booked meeting out.

This repository contains the **open SDK**: MIT-licensed client libraries, the Claude/MCP connector, API reference and integration examples. The agent engine itself runs on Zoplio's hosted infrastructure, so every SDK call hits the hosted API.

## Packages

| Package | Install | What it is |
|---------|---------|------------|
| [`@zoplio/sdk-js`](packages/sdk-js) | `npm i @zoplio/sdk-js` | TypeScript/Node client for API v1 (meetings, webhooks, HMAC verification) |
| [`zoplio`](packages/sdk-python) | `pip install zoplio` | Python client, 1:1 mirror of the JS SDK |
| [`@zoplio/claude-tool`](packages/claude-tool) | `npm i @zoplio/claude-tool` | Connect Claude (or any MCP client) to Zoplio's hosted MCP server |

Get an API key (`zpl_<hex>`) from the dashboard at [zoplio.com](https://zoplio.com) and pass it as `Authorization: Bearer zpl_...` on every `/v1` route.

## Roles: you, participants, organizer

The account that owns the API key is the organizer. `participants` are the people Zoplio invites. To arrange a meeting for someone else, set `organizer`.

- **You** are the account the key belongs to, a Zoplio user like anyone on WhatsApp. A meeting you create runs on your calendar, in your timezone and working hours; Zoplio tells you when the invitees answer and the meeting counts against your plan.
- **`participants`** (1 to 8) are all invited, and one is enough. Listing your own number or e-mail as a participant answers `400 validation_failed` ("That is your own number/e-mail. Add the people you want to meet as participants.").
- **`organizer`** (optional) is the on-behalf mode for an agency or an assistant booking for someone else: that person is then the organizer (their calendar and timezone), every participant is still invited, and the meeting still bills to your account.

## 60-second tour

Create a meeting. You are the organizer; Zoplio takes it from there:

```ts
import { ZoplioClient } from '@zoplio/sdk-js';

const zoplio = new ZoplioClient({ apiKey: process.env.ZOPLIO_API_KEY! });

const meeting = await zoplio.scheduleMeeting({
  title: 'Intro call',
  durationMinutes: 30,
  participants: [{ phone: '+420777123456', name: 'Jana' }],
  preferredDate: '2026-09-16', // Wednesday
  preferredTime: '14:00',
  timezone: 'Europe/Prague', // always send it with preferredTime
});
// -> { meetingId, negotiationId, status: 'negotiating', proposedSlots: [...] }
```

Zoplio messages Jana on WhatsApp, negotiates, and confirms. The meeting lands on your calendar and Zoplio tells you once it is booked. `GET /v1/meetings/:id` (`zoplio.getMeeting(...)`) returns every participant with its `role`, either `organizer` or `participant`.

To arrange a meeting for someone else, name them as the `organizer`. Petr is then the organizer and Jana the invitee, and the meeting still bills to your account:

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

Learn the outcome via webhooks. Five events are available: `meeting.created`, `meeting.confirmed`, `meeting.cancelled`, `meeting.rescheduled` and `negotiation.failed` (omit `events` to subscribe to all five):

```ts
await zoplio.createWebhook({ url: 'https://your.app/zoplio-webhook',
  events: ['meeting.confirmed', 'meeting.rescheduled', 'meeting.cancelled'] });
// deliveries are HMAC-signed:
ZoplioClient.verifyWebhookSignature(rawBody, req.headers['x-zoplio-signature'], secret);
```

`meeting.rescheduled` fires the moment a confirmed meeting re-opens to move; its payload carries `previousSlot`, and a fresh `meeting.confirmed` (or a cancellation) follows when the renegotiation resolves.

Or let an AI agent do it. Zoplio speaks MCP:

```bash
claude mcp add --transport http zoplio https://api.zoplio.com/mcp \
  --header "Authorization: Bearer zpl_YOUR_KEY"
# then just ask Claude: "set up 30 minutes with Jana on Wednesday afternoon"
```

## Pricing

You are billed per **confirmed** meeting: the agent negotiates for free and you
only pay when a time is actually booked. Every account starts on the **free**
plan with 3 confirmed meetings and 15 meeting requests per calendar month (UTC),
no card required. Meetings still being arranged count against the 3 until they
confirm or fall through. Beyond either limit the API returns `402` with code
`quota_exceeded` and a message saying which limit it was; upgrade to a paid plan
to keep booking. For a CRM integration serving many end-users, all meetings
booked with your API key roll up to your one account, so volume pricing applies
as you grow. Talk to us at [zoplio.com](https://zoplio.com) for paid and
enterprise plans.

```ts
try {
  await zoplio.scheduleMeeting({ /* ... */ });
} catch (err) {
  if (err instanceof ZoplioApiError && err.code === 'quota_exceeded') {
    // free tier exhausted this month: prompt to upgrade
  }
}
```

Rate limits: 60 requests/min per key, plus a shared ceiling of 300 requests/min per IP across all keys. Sign-in and key provisioning allow 15 requests/min per IP.

## Docs

- [Quickstart](docs/quickstart.md): keys, first meeting, webhooks, SDKs, MCP
- [OpenAPI 3.1 reference](docs/openapi.yaml): the full v1 surface
- [Webhook receiver example](examples/webhook-receiver): Express plus signature verification

## What's open and what's hosted

The client libraries, MCP connector, examples and docs in this repo are MIT-licensed: read them, fork them, build adapters on top (Discord/Teams/Telegram adapters welcome). The scheduling engine, meaning the negotiation logic, multi-party consensus, preference learning and prompts, is Zoplio's hosted product and is not part of this repository. There is no self-hosted mode; the SDKs are thin, auditable clients for the hosted API.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs for the SDKs, docs and examples are very welcome.
