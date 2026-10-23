# Agent instructions

Scope: how to ship a release of this package. Everything here is derivable from
the repository; nothing depends on a previous conversation.

## What publishing is

`npm publish` from a laptop is **not** the release path and must not be used. A
release happens when a GitHub Release is *published*:

- `.github/workflows/release.yml` triggers on `release: types: [published]`.
- Pushing a tag publishes **nothing**. Do not assume a tag push shipped a version.
- The human clicking *Publish release* is the single gate. Stop before it unless
  the current request explicitly authorises publishing.

## The release procedure

```bash
# 1. Version and changelog.
npm version <x.y.z> --no-git-tag-version    # edits package.json only
#    then update CHANGELOG.md: add a `## [x.y.z] — YYYY-MM-DD` section, keeping
#    the Keep a Changelog headings (Added / Changed / Fixed / Removed).
git add -A && git commit -m "chore(release): x.y.z"
git push origin main
#    Wait for CI on that commit before continuing; the release workflow repeats
#    the same checks, so a red main is a red release.

# 2. Tag the release commit, annotated, and push it.
git tag -a vx.y.z -m "..."
git push origin vx.y.z

# 3. Draft the release with its notes. --verify-tag makes a missing or typo'd
#    tag fail instead of silently creating a lightweight one on the remote.
gh release create vx.y.z --verify-tag --draft --title "..." --notes-file notes.md

# 4. Publishing is the human step:
gh release edit vx.y.z --draft=false
```

Release notes come from the matching `CHANGELOG.md` section. `--generate-notes`
is a fallback only: it summarises merged pull requests and this repository is
pushed directly to `main`, so it would produce an empty body.

## Choosing the version number

Semver applies to the plugin's **observable behaviour in the Harness UI**, not to
file counts.

| Change | Bump |
| : --- | : --- |
| Docs, CI, build tooling, no shipped byte differs | patch (`0.2.1` → `0.2.2`) |
| New board, new setting, new seat in the UI | minor |
| Entry point or interaction model replaced | minor while `0.y`; the pre-1.0 rule is that any release can break |

When `package.json` and the tag disagree, **the tag is the release**: fix the
manifest, never move the tag.

## What the workflow checks, and what each failure means

`release.yml` fails before publishing when:

- the tag does not match `package.json`, or does not start with `v`;
- the version already exists on npm (npm forbids republishing a version);
- `NPM_TOKEN` is not configured as a repository secret;
- typecheck, build, tests or `npm pack` fail.

Pre-release versions (`-rc.1` and friends) publish under the `next` dist-tag so
`latest` is never polluted.

## The trap that matters most: `ETARGET` after a successful publish

The job installs the published version into a clean directory as its final
check. A just-published version can stay invisible to that runner for minutes
while the publish itself already succeeded, and `npm install` answers

    npm error code ETARGET  notarget No matching version found

**That is registry propagation, not a broken package.** Before concluding
anything:

```bash
npm view dsh-plugin-status-board dist-tags --json   # is the version listed?
npm view dsh-plugin-status-board@<v> version        # exit 0 = visible, 1 = not yet
gh run view <id> --json jobs -q '.jobs[].steps[] | [.conclusion, .name] | @tsv'
```

Read the step conclusions: `Publish to npm` **success** plus a red install-back
step means the release shipped and only the verification lagged. Do **not** bump
the version, delete the release, or re-publish in that situation — that is how a
working release becomes a stray version on the registry.

`gh run view --log-failed` can fail with a TLS timeout in restricted networks.
The job log is served from blob storage; step conclusions and check-run
annotations come from `api.github.com` and are the reliable path:

```bash
gh api repos/<owner>/<repo>/check-runs/<job-id>/annotations \
  --jq '.[] | select(.annotation_level=="failure") | .message'
```

Retry an environment-class failure once, then report it as environmental with the
log excerpt instead of looping.

## Build invariants — do not "clean these up"

- **`tsdown.config.mjs` stays `.mjs`.** tsdown picks its config loader from
  `process.features.typescript`; on a Node without type stripping it falls back
  to `unrun`, an optional peer that is not installed. Renaming it to `.ts` makes
  CI red while every modern machine stays green.
- **`pnpm-workspace.yaml` keeps `autoInstallPeers: false`.** pnpm installs peers
  by default, and these peers are the Harness host's own modules, injected at
  runtime via `dsh.client.inject`. Letting pnpm install them pulled the entire
  application tree into the lockfile (measured 1273 → 2418 lines).
- **`release.yml` must not delegate to `ci.yml` via `workflow_call`.** npm's
  trusted-publisher validation reads the *calling* workflow's name, and
  `setup-node` only writes the credential when `registry-url` is set — without
  it `NODE_AUTH_TOKEN` is ignored and the error resurfaces as `ENEEDAUTH` steps
  later.
- `engines.node: >=20` describes the Node that hosts the plugin inside Harness
  and is asserted by `target: node20` on the Host half. CI's Node 24 is the
  toolchain floor; they are different claims, do not "align" them.
- Both credentials are needed and they do different jobs: `NPM_TOKEN`
  authenticates the publish, `id-token: write` obtains the Sigstore certificate
  for provenance. Dropping the permission still publishes, it just loses the
  attestation silently.

## Style constraints enforced by tests

`tests/artifacts.test.ts` and `tests/panel.test.tsx` fail the build if the
shipped stylesheet contains a raw hex colour or an `rgba()`. The check runs over
the whole `PANEL_CSS` string, so **a hex value inside a CSS comment breaks it
too** — state a resolved colour in prose without the `#`, or move the detail to
the module doc block above the template. Colour comes from `--dsw-alias-*` theme
tokens, with tints derived through `color-mix()`. Note that a token's **name is
not its value**: in this theme `brand-primary` resolves to near-black and
`state-idle-primary` to a grey that vanishes on white. Resolve a token before
depending on what it sounds like.

The stylesheet is a single `String.raw` template in `src/client/styles.ts`. A
backtick anywhere inside it — **including in a CSS comment** — terminates the
template literal.

## Verification bar

Before claiming a release worked, all of these need evidence, not inference:

1. `git log --oneline -1` equals `origin/main` and equals the commit the tag
   points at (`git rev-list -n1 vx.y.z`);
2. `npm view dsh-plugin-status-board dist-tags --json` shows the expected
   version under `latest`;
3. the release workflow's `Publish to npm` step concluded `success`;
4. provenance is actually attached, not merely requested:
   `https://registry.npmjs.org/-/npm/v1/attestations/<pkg>@<v>` returns a non-empty
   `attestations` array;
5. install-back reached `success` (see the `ETARGET` section if it did not).

Reporting "published" from a green run that skipped the publish, or from a run
whose only failure is propagation lag, is wrong in both directions.

## Known registry state

`0.0.0-stage` is a leftover placeholder (345 bytes, no entry point, no matching
commit) from a manual publish. Never cite it as a released version and never use
it as a version-number precedent.
