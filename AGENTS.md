# chutes

Per-file triage for large refactors. A CLI that classifies every file in a
Migration into `mechanical` / `judgment` / `redesign`, each with a confidence
number, and writes the result to a version-controlled Plan.

TypeScript / Node, distributed via `npx`.

Design principle: **code owns control flow, the Judge only makes judgements.**
Anything countable (import degree, topological order, test coverage, cost) is
computed in code and passed in as State — never asked of the Judge. A Judge
asked a question it cannot answer from what it was shown will guess, and the
guess is indistinguishable from an answer.

Read `CONTEXT.md` before writing anything user-facing: it fixes the domain
vocabulary, and each term lists the words to avoid in its place.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, via the `gh` CLI. Create with
`gh issue create`, read with `gh issue view <n>`, close with
`gh issue close <n>`. External pull requests are not part of the triage queue.

### Triage labels

The five canonical triage roles, each using its own name as the label string:

| Label             | Meaning                                  |
| ----------------- | ---------------------------------------- |
| `needs-triage`    | Maintainer needs to evaluate this issue  |
| `needs-info`      | Waiting on reporter for more information |
| `ready-for-agent` | Fully specified, ready for an AFK agent  |
| `ready-for-human` | Requires human implementation            |
| `wontfix`         | Will not be actioned                     |

### Domain docs

Single-context. `CONTEXT.md` at the repo root is the glossary and holds no
implementation detail. Should an ADR ever be written, it goes in `adr/` at the
repo root, because `docs/` is not published (see below).

## Repo conventions

- **`docs/` is local-only and gitignored in full.** It is a scratch area for
  design notes that are not part of what is published. Nothing in it is
  visible to anyone who clones this repo, so never reference it from a tracked
  file.
- **Everything publicly visible is English** — source, comments, commit
  messages, issues, and every tracked document.
- Tests run at two seams and no others: the CLI process boundary, and the
  Judge interface. Both are recorded in the M0 spec issue.
