# Fixture Repo

A small hand-written codebase with a hand-assigned Lane for every file, and a
recorded set of Judge answers so classifying it is deterministic.

## What this is for

**This is a regression check. It catches the classifier getting worse. It is
not evidence that the classifier is right.**

That distinction is the entire point of this directory, and it has to be
repeated wherever these results appear. The files here were written by the
same person who wrote the questions and chose the Thresholds, and the
recorded answers were written alongside the labels they are checked against.
A regression suite like that can tell you that a change to the questions, the
Thresholds or the composition rule moved a file from one Lane to another. It cannot tell
you the Lane was correct in the first place, because it carries exactly the
assumptions it would need to be independent of.

Whether the classification is actually accurate can only be established
against a real codebase with a hand-labelled sample, scored against the
tool's own Confidence. That is Calibration's job, and it has not been done.

**Do not quote a pass rate from this suite as an accuracy figure.**

## Layout

| Path | What it is |
| --- | --- |
| `repo/` | The fixture codebase: a Vue 2 to Vue 3 Migration. |
| `labels.json` | The hand-assigned Lane for each file. |
| `replay.json` | Recorded Judge answers, so a run needs no network and no API key. |
| `migration.yml` | The Migration configuration the suite scans under. |

Thirty-six files carry a Lane, twelve per Lane, and several sit deliberately
close to a boundary: `Breadcrumb.vue` is nearly Mechanical but reaches for the
root instance, `Wizard.vue` is mixin-heavy without changing its public API,
and `KeepAliveCache.vue` touches framework internals that a redesign would
remove. Files under `helpers/` match no Detect Rule and must stay Untouched:
absent from the Plan, present in the dependency graph.

## Running it

```sh
pnpm test tests/fixture.test.ts
```

No network access and no API key: `judge.backend` is `replay`.

## When it fails

The failure names the files whose Lane moved and which way. That list is the
finding. Decide whether the change was an improvement — and if it was, update
`labels.json` in the same commit, so the baseline always states what the tool
is currently believed to do.
