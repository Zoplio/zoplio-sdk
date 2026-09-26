# Changelog

All three packages ship from this repo. Versions follow [semver](https://semver.org/); while the major version is 0, a minor bump may change behaviour and a patch bump does not.

## 0.3.1 (sdk-js, Python) / 0.1.2 (claude-tool), unreleased

### @zoplio/sdk-js 0.3.1 and zoplio (Python) 0.3.1

- `skippedParticipants` matches what the API sends: each entry is `{ name?, email?, phone?, reason }`. Zoplio names the dropped person by `name`; `email` / `phone` appear only when Zoplio knows the contact is exactly the one from your request. `reason` is an open string (`'opted_out' | (string & {})` in TypeScript, `str` in Python): unknown values mean "not invited", never an error. Python's `SkippedParticipant` gains `name`.
- New `getUsage()` / `get_usage()` for `GET /v1/usage`: plan, UTC month, confirmed and created counts, and the month's limits (`null` / `None` = uncapped).
- Webhook deliveries document their dedupe key: the body's `id`, equal to the `X-Zoplio-Delivery-Id` header and the same on every retry (`WebhookDeliveryBody.id`, `WebhookDelivery.id`).
- Every request sends `User-Agent: zoplio-sdk-js/<version>` / `zoplio-python/<version>`. `SDK_VERSION` (JS) and `zoplio.__version__` (Python) expose the version.
- sdk-js: `package.json` is exported (`require('@zoplio/sdk-js/package.json')` works).
- Python: classifiers for 3.13 and 3.14; CI runs 3.10 to 3.14. Client methods still return plain `dict`s (typed dict returns are planned for a minor release, since they would change static types).
- Docs: examples no longer carry past dates (they are date-free or compute the date from today, and CI rejects literal dates under 30 days away), use the fictional number `+15555550100`, explain how to get a key in the dashboard, document `GET /v1/usage`, the `Retry-After` header on `429`, and webhook dedupe. The webhook snippet type-checks under strict TypeScript.

### @zoplio/claude-tool 0.1.2

- README: setup for Claude Code (CLI and `.mcp.json`), Cursor, Claude Desktop (via `mcp-remote`, plus custom connectors on Team/Enterprise) and raw curl (`initialize`, `tools/list`). The package is documentation plus `mcpServerConfig()`; it has no CLI.

## 0.3.0 (sdk-js, Python) / 0.1.1 (claude-tool), 2026-09-11

Baseline of the published packages.

- The account that owns the API key is the organizer; `participants` (1 to 8) are all invited and one is enough; `organizer` is the optional on-behalf mode.
- Meetings: `scheduleMeeting`, `getMeeting` (each person's `status`, `attending` and `role`), `listMeetings`, `cancelMeeting`, `rescheduleMeeting` with `X-Idempotency-Key` on create and reschedule.
- Webhooks: `createWebhook`, `listWebhooks`, `deleteWebhook`, five events including `meeting.rescheduled` with `previousSlot`, and `verifyWebhookSignature` / `verify_webhook_signature`.
- Errors carry the API envelope (`ZoplioApiError` / `ZoplioError` with `code`, `status`, `details`).
- `@zoplio/claude-tool`: hosted MCP server docs and `mcpServerConfig()`.
