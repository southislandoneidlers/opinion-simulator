# Handoff: first public GitHub release

- Date: 2026-09-11
- Status: complete
- Scope: publish the local `main` branch as a public repository under
  `southislandoneidlers/opinion-simulator`, with Apache-2.0 licensing and
  GitHub noreply author emails. No product behavior change.

## Confirmed user decisions

- Repository: `https://github.com/southislandoneidlers/opinion-simulator`
- Visibility: public
- License: Apache-2.0 (`LICENSE` + `NOTICE`)
- Include uncommitted v0.4 increment 5 (OpenRouter) in the published tree
- Rewrite commit author/committer emails to the GitHub noreply address
  `159109250+southislandoneidlers@users.noreply.github.com` before the first
  push (history had not been published)

## What shipped in this task

- Root `LICENSE` (Apache-2.0) and `NOTICE` (copyright 2026 李昱昕)
- `package.json` `"license": "Apache-2.0"` (npm remains `"private": true`)
- License sections in `README.md` and `README.zh-TW.md`
- `CONTRIBUTING.md` now points at the applied Apache-2.0 files
- `SECURITY.md` points private reports at GitHub Security Advisories
- Local git identity for this repo set to 李昱昕 + GitHub noreply email

## Verified

- `npm test`: JS workspaces 183 tests + Python Skill suite 24 tests, all pass
- Local pattern scan of the working tree found no live API keys
- `.gitignore` still excludes `node_modules/`, `dist/`, `.env`, and `需刪除/`
- `.env` is not tracked; `.env.example` contains only empty `GEMINI_API_KEY=`

## Live-provider call status

None. This task did not call Gemini, OpenAI, or OpenRouter.

## Secret exposure

None. Credentials remain in OS credential stores / environment variables.
Commit author emails in the published history use the GitHub noreply address
only. The previous local mailbox `liyuxin@liyuxindeMacBook-Air.local` was
rewritten before the first push.

## Limits left in place

- Root README status text is still dated 2026-08-24 / v0.1
- Roadmap v1.0 public-release blockers (signed builds, full history/artifact
  review, published security contact beyond GitHub Advisories) are not closed
- `examples/walkthroughs/` and tracked Workbook templates under `outputs/`
  are in the published tree
