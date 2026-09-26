# Releasing the SDK packages

Three packages ship from this repo:

| Package | Registry | Manifest | Current version |
|---------|----------|----------|-----------------|
| `@zoplio/sdk-js` | npm | `packages/sdk-js/package.json` (+ `src/version.ts`) | 0.3.1 |
| `@zoplio/claude-tool` | npm | `packages/claude-tool/package.json` | 0.1.2 |
| `zoplio` | PyPI | `packages/sdk-python/pyproject.toml` (+ `src/zoplio/_version.py`) | 0.3.1 |

The manifests, package READMEs, `CHANGELOG.md` and `LICENSE` copies are owned by this repo; the SDK sources, `docs/openapi.yaml`, `docs/quickstart.md` and `scripts/check-sdk-example-dates.mjs` arrive from Zoplio's internal tree through a sync that never overwrites the manifests or READMEs. Bump the manifest versions here. The version constants the SDKs send in `User-Agent` (`packages/sdk-js/src/version.ts`, `packages/sdk-python/src/zoplio/_version.py`) arrive with the sources; a unit test in each package fails when the constant and the manifest disagree.

## Before publishing

1. `main` is green in CI and the working tree is clean (`git status`).
2. `CHANGELOG.md` has a section for the version, with the release date filled in.
3. The version in each manifest you are about to publish is higher than what the registry has (`npm view @zoplio/sdk-js version`, `npm view @zoplio/claude-tool version`, `pip index versions zoplio`).
4. You are logged in: `npm whoami` shows an account with publish rights on the `@zoplio` scope, and a PyPI API token is available to `twine` (for example in `~/.pypirc` or `TWINE_USERNAME=__token__` plus `TWINE_PASSWORD`).

## @zoplio/sdk-js

```bash
cd packages/sdk-js
npm ci
npm test
npm run build
npm pack --dry-run   # expect dist/*, README.md, LICENSE, package.json
npm publish          # prepublishOnly rebuilds dist
```

## @zoplio/claude-tool

```bash
cd packages/claude-tool
npm test
npm pack --dry-run   # expect index.js, README.md, LICENSE, package.json
npm publish
```

## zoplio (Python)

Always delete `dist/` first. A stale wheel of the previous version left there would be uploaded again by `twine upload dist/*`, and PyPI rejects the re-upload, which fails the whole run.

```bash
cd packages/sdk-python
rm -rf dist build src/*.egg-info
python -m venv .venv && . .venv/bin/activate
pip install --upgrade build twine
python -m build          # must print no deprecation warnings
twine check dist/*
twine upload dist/*
deactivate
```

The wheel and sdist must both contain `LICENSE` (`unzip -l dist/zoplio-*.whl | grep LICENSE`).

## Afterwards

- Tag the commit you published from, one tag per package: `sdk-js-v0.3.1`, `claude-tool-v0.1.2`, `sdk-python-v0.3.1`.
- Check the rendered pages: [npmjs.com/package/@zoplio/sdk-js](https://www.npmjs.com/package/@zoplio/sdk-js), [npmjs.com/package/@zoplio/claude-tool](https://www.npmjs.com/package/@zoplio/claude-tool), [pypi.org/project/zoplio](https://pypi.org/project/zoplio/). Package READMEs link with absolute URLs so they render the same on every registry.
- Install each published artifact into a clean environment once and run the quickstart snippet against it.
