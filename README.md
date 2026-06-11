# Zoplio SDK

**Zoplio is an AI scheduling agent exposed as a hosted API.** You tell it who to meet and roughly when — its agent reaches every participant over WhatsApp or email, negotiates the back-and-forth ("can't do Tuesday, what about Wednesday 4pm?"), handles groups, holdouts and reschedules, and confirms a slot. One API call in, a booked meeting out.

This repository contains the **open SDK**: MIT-licensed client libraries, the Claude/MCP connector, API reference and integration examples. The agent engine itself runs on Zoplio's hosted infrastructure — every SDK call hits the hosted API.

> **Status: private beta.** Request developer access at [zoplio.com](https://zoplio.com). Package registry releases (npm / PyPI) land together with general availability; until then, install from this repo.

## Packages

| Package | What it is |
|---------|------------|
| [`@zoplio/sdk-js`](packages/sdk-js) | TypeScript/Node client for API v1 (meetings, webhooks, HMAC verification) |
| [`zoplio`](packages/sdk-python) | Python client, 1:1 mirror of the JS SDK |
| [`@zoplio/claude-tool`](packages/claude-tool) | Connect Claude (or any MCP client) to Zoplio's hosted MCP server |

## 60-second tour

Create a meeting — Zoplio takes it from there:

```ts
import { ZoplioClient } from '@zoplio/sdk-js';

const zoplio = new ZoplioClient({ apiKey: process.env.ZOPLIO_API_KEY });

const meeting = await zoplio.scheduleMeeting({
  title: 'Intro call',
  durationMinutes: 30,
  participants: [{ phone: '+420777123456', name: 'Jana' }, { email: 'petr@example.com' }],
  preferredDate: '2026-06-22',
  preferredTime: '14:00',
  timezone: 'Europe/Prague',
});
// → { meetingId, negotiationId, status: 'negotiating', proposedSlots: [...] }
```

Zoplio messages Jana on WhatsApp and Petr by email, negotiates, and confirms. Learn the outcome via webhooks:

```ts
await zoplio.createWebhook({ url: 'https://your.app/zoplio-webhook',
  events: ['meeting.confirmed', 'meeting.cancelled'] });
// deliveries are HMAC-signed:
ZoplioClient.verifyWebhookSignature(rawBody, req.headers['x-zoplio-signature'], secret);
```

Or let an AI agent do it — Zoplio speaks MCP:

```bash
claude mcp add --transport http zoplio https://api.zoplio.com/mcp \
  --header "Authorization: Bearer zpl_YOUR_KEY"
# then just ask Claude: "set up 30 minutes with Jana next Tuesday afternoon"
```

## Docs

- [Quickstart](docs/quickstart.md) — keys, first meeting, webhooks, SDKs, MCP
- [OpenAPI 3.1 reference](docs/openapi.yaml) — the full v1 surface
- [Webhook receiver example](examples/webhook-receiver) — Express + signature verification

## What's open and what's hosted

The client libraries, MCP connector, examples and docs in this repo are MIT-licensed — read them, fork them, build adapters on top (Discord/Teams/Telegram adapters welcome). The scheduling engine — negotiation logic, multi-party consensus, preference learning, prompts — is Zoplio's hosted product and isn't part of this repository. There is no self-hosted mode; the SDKs are thin, auditable clients for the hosted API.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs for the SDKs, docs and examples are very welcome.
