# chutes

Per-file triage for big refactors. A CLI that classifies every file in a
migration into `mechanical` / `judgment` / `redesign`, then schedules the work
into dependency-ordered waves.

TypeScript / Node, distributed via `npx`. Ships an optional editor plugin.

Design principle: **code owns control flow, the model only makes judgements.**
Anything countable (line counts, import degree, topological order, cost) is
computed in code and passed in as state — never asked of the model.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using their default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Repo conventions

- `docs/` is a local scratch area and is gitignored, **except** `docs/agents/`,
  which is tracked and shared. Don't put anything in `docs/` you expect a
  teammate to see unless it goes under `docs/agents/`.
