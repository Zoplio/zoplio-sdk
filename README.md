# Zoplio SDK

**Zoplio is an AI scheduling agent behind an API: you say who to invite, it negotiates a time with every invitee over WhatsApp or e-mail and books the meeting.**

[Quickstart](docs/quickstart.md) · [OpenAPI reference](docs/openapi.yaml) · [npm: @zoplio/sdk-js](https://www.npmjs.com/package/@zoplio/sdk-js) · [PyPI: zoplio](https://pypi.org/project/zoplio/) · [MCP setup](packages/claude-tool) · [zoplio.com/docs](https://zoplio.com/docs)

## 30-second quickstart

1. Get a key: sign in at [zoplio.com/dashboard/api](https://zoplio.com/dashboard/api) with Google, then **API keys** > **Create key**. Keys start with `zpl_`. The free plan covers 3 confirmed meetings and 15 meeting requests a month.
2. Install and book:

```bash
npm i @zoplio/sdk-js
export ZOPLIO_API_KEY=zpl_YOUR_KEY
```

```ts
import { ZoplioClient } from '@zoplio/sdk-js';

const zoplio = new ZoplioClient({ apiKey: process.env.ZOPLIO_API_KEY! });

// You are the organizer. No date fields: Zoplio proposes free slots over the next week.
const meeting = await zoplio.scheduleMeeting({
  title: 'Intro call',
  participants: [{ phone: '+15555550100', name: 'Jana' }], // use a real number or e-mail
});
// -> { meetingId, negotiationId, status: 'negotiating', proposedSlots: [...] }
```

Zoplio messages Jana, negotiates, and confirms. The meeting lands on your calendar and Zoplio tells you once it is booked; `zoplio.getMeeting(meeting.meetingId)` or a webhook tells your code.

Python: `pip install zoplio`, then `ZoplioClient(api_key=...).schedule_meeting(participants=[...])`.

Or let an AI agent do it. Zoplio speaks MCP:

```bash
claude mcp add --transport http zoplio https://api.zoplio.com/mcp --header "Authorization: Bearer $ZOPLIO_API_KEY"
# then ask Claude: "set up 30 minutes with Jana on Wednesday afternoon"
```

Cursor, Claude Desktop and raw curl setups: [packages/claude-tool](packages/claude-tool#connect).

## Packages

| Package | Install | What it is |
|---------|---------|------------|
| [`@zoplio/sdk-js`](packages/sdk-js) | `npm i @zoplio/sdk-js` | TypeScript/Node client for API v1 (meetings, usage, webhooks, HMAC verification) |
| [`zoplio`](packages/sdk-python) | `pip install zoplio` | Python client, 1:1 mirror of the JS SDK |
| [`@zoplio/claude-tool`](packages/claude-tool) | `npm i @zoplio/claude-tool` | MCP setup docs for Claude Code, Cursor, Claude Desktop, plus a config helper |

This repository is the **open SDK**: MIT-licensed client libraries, the MCP connector docs, the API reference and integration examples. The agent engine runs on Zoplio's hosted infrastructure, so every SDK call hits the hosted API.

## Roles: you, participants, organizer

The account that owns the API key is the organizer. `participants` are the people Zoplio invites. To arrange a meeting for someone else, set `organizer`.

- **You** are the account the key belongs to, a Zoplio user like anyone on WhatsApp. A meeting you create runs on your calendar, in your timezone and working hours; Zoplio tells you when the invitees answer and the meeting counts against your plan.
- **`participants`** (1 to 8) are all invited, and one is enough. Listing your own number or e-mail as a participant answers `400 validation_failed`.
- **`organizer`** (optional) is the on-behalf mode for an agency or an assistant booking for someone else: that person is then the organizer (their calendar and timezone), every participant is still invited, and the meeting still bills to your account.

## A little more

Pick an exact time (the date is computed, so the snippet keeps working):

```ts
const nextWednesday = (() => {
  const d = new Date();
  d.setDate(d.getDate() + (((3 - d.getDay() + 7) % 7) || 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

await zoplio.scheduleMeeting({
  title: 'Intro call',
  participants: [{ phone: '+15555550100', name: 'Jana' }],
  preferredDate: nextWednesday,
  preferredTime: '14:00',
  timezone: 'Europe/Prague', // always send it with preferredTime
});
```

Learn the outcome via webhooks: `meeting.created`, `meeting.confirmed`, `meeting.cancelled`, `meeting.rescheduled` (carries `previousSlot`) and `negotiation.failed`. Deliveries are HMAC-signed and at-least-once, so dedupe on `X-Zoplio-Delivery-Id`:

```ts
await zoplio.createWebhook({
  url: 'https://your.app/zoplio-webhook',
  events: ['meeting.confirmed', 'meeting.rescheduled', 'meeting.cancelled'],
});

// in your handler, over the RAW body:
const signature = req.headers['x-zoplio-signature'];
const ok = ZoplioClient.verifyWebhookSignature(rawBody, typeof signature === 'string' ? signature : '', secret);
```

A runnable receiver is in [examples/webhook-receiver](examples/webhook-receiver).

## Pricing and limits

You are billed per **confirmed** meeting: the agent negotiates for free and you only pay when a time is actually booked. Every account starts on the **free** plan with 3 confirmed meetings and 15 meeting requests per calendar month (UTC), no card required. Meetings still being arranged count against the 3 until they confirm or fall through, so cancel test meetings you no longer need. `GET /v1/usage` (`zoplio.getUsage()`) shows what is left. Beyond either limit the API returns `402` with code `quota_exceeded` and a message saying which limit it was. All meetings booked with your key roll up to your one account. Talk to us at [zoplio.com](https://zoplio.com) for paid and enterprise plans.

Rate limits: 60 requests/min per key (REST and MCP together), plus a shared ceiling of 300 requests/min per IP. A `429` carries `Retry-After` (seconds).

## Docs

- [Quickstart](docs/quickstart.md): key, first meeting, usage, webhooks, SDKs, MCP
- [OpenAPI 3.1 reference](docs/openapi.yaml): the full v1 surface
- [Changelog](CHANGELOG.md)
- [Webhook receiver example](examples/webhook-receiver): Express, signature verification and dedupe

## What's open and what's hosted

The client libraries, MCP connector docs, examples and docs in this repo are MIT-licensed: read them, fork them, build adapters on top (Discord/Teams/Telegram adapters welcome). The scheduling engine, meaning the negotiation logic, multi-party consensus, preference learning and prompts, is Zoplio's hosted product and is not part of this repository. There is no self-hosted mode; the SDKs are thin, auditable clients for the hosted API.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs for the SDKs, docs and examples are very welcome.
