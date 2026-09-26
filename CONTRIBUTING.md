# Contributing

Thanks for helping make the Zoplio SDK better!

## What lives here

This repo is Zoplio's **open SDK**: client libraries (`packages/sdk-js`, `packages/sdk-python`), the Claude/MCP connector (`packages/claude-tool`), API docs and examples. The hosted agent engine is a separate, closed codebase; engine behavior questions and scheduling bugs belong to support, not this tracker.

Great contributions: SDK bug fixes, typed-response improvements, new integration examples, adapters built on the SDKs (Discord, Teams, Telegram, …), docs fixes.

## Ground rules

- **Wording:** Zoplio is "open SDK" / "developer-first with open client libraries"; the product itself is a hosted API, not open source and not self-hostable. Docs changes should keep that framing accurate.
- **No secrets or internal endpoints** in code, tests, or docs: examples use `https://api.zoplio.com` and placeholder keys (`zpl_YOUR_KEY`).
- Keep the JS and Python clients in 1:1 method parity; if you change one, mirror the other (or note the gap in the PR).
- Tests: `npm test` in `packages/sdk-js` and `packages/claude-tool`; `pytest` and `mypy src` in `packages/sdk-python`.
- Examples must keep working when copied: no literal dates under 30 days away (make the example date-free or compute the date from today). `node scripts/check-sdk-example-dates.mjs .` checks it, and CI runs it. Use fictional numbers such as `+15555550100` and `example.com` addresses.

## Workflow

1. Fork, branch, change, add/adjust tests.
2. PR with a short description of behavior before/after.
3. CI must be green; a maintainer reviews and merges.

Maintainers publish the packages from this repo; the steps are in [docs/RELEASING.md](docs/RELEASING.md).

By contributing you agree your contributions are licensed under the MIT license of this repository.
