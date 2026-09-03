# Handoff: v0.2 increment 6 — persistent queue, cancel/resume/retry

- Date: 2026-08-25
- Status: complete
- Next task: v0.2 increment 7 — IPC hardening + secret-access failure tests
  (implemented in the same working session; see the increment 7 handoff)

## What was implemented

- App-data queue file `<userData>/run-queue.json` (path injected via
  `configureQueueDirectory`; production wires Electron `userData` in `main.ts`).
- Missing file = empty queue; corrupt/unknown schema refused, never rewritten.
- Jobs store the frozen Run ids and the request snapshot needed to execute
  after restart. No credentials are stored.
- `enqueueRun` / `processQueue` / `cancelJob` / `retryJob` /
  `resumeMissingJobs` on the session seam.
- Restart / `resumeMissingJobs`: a Job whose Run artifact already exists is
  marked completed and is never re-executed. Only queued or interrupted
  (`running` without a Run file) Jobs are resumed.
- Cancel is cooperative (queued Jobs drop immediately; a running Job is
  skipped before `writeCompletedRun`). Retry is explicit for failed/cancelled
  Jobs whose Run is still missing.
- Renderer Execution stage shows the queue with 取消 / 重試.

## IPC channels

`queue.enqueue`, `queue.list`, `queue.cancel`, `queue.retry`,
`queue.resumeMissing`. Summaries never include the request body (Source /
Persona).

## Contract documents

- `docs/architecture/overview.md`
- `docs/ux/workspace.md`
- `docs/quality/test-strategy.md`

## Verification

- Covered by the increment 7 full-suite run in the same session.
- Live-provider call status: none.
- Secret exposure: none. Queue file is asserted free of credential-shaped
  fields.

## Notes

- Direct `run.mocked` / `run.live*` remain as the execution engine and as
  the existing test seam; the UI goes through the queue.
- No git operations performed.
