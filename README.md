# chutes

Per-file triage for large refactors.

> ## ⚠️ Pre-alpha, and not yet calibrated
>
> Two warnings come before anything else, because they decide whether this tool
> is useful to you today.
>
> **This is pre-alpha.** Commands, configuration keys and output formats will
> change without notice, and there is no stable release.
>
> **The classification is not calibrated.** chutes reports a confidence number
> with every decision, but nobody has yet measured whether that number is
> honest — whether the files it calls 90% confident are right about 90% of the
> time. Until Calibration exists, treat every result as a suggestion to a human
> reviewer. **Do not wire it into anything that acts unsupervised.**

## The problem

A large refactor arrives as one number: *four hundred files*. That number tells
you nothing you can plan with. Some of those files are a find-and-replace.
Some need somebody who remembers why the code is shaped that way. A few should
not be migrated at all — they should be redesigned.

Reading four hundred files to find out which is which costs more than doing
some of the work. So the usual answer is to not find out: assign the whole
thing to whoever is free, and discover the hard files in code review, weeks
later, when the plan has already been committed to.

## What chutes does

chutes reads each file and sorts it into one of three **Lanes**:

| Lane | Meaning |
| --- | --- |
| **Mechanical** | The change is deterministic. A codemod, or a junior engineer with the pattern in front of them. |
| **Judgment** | The change is clear but the context is not. Needs someone who knows why this code exists. |
| **Redesign** | The file should not be migrated as it stands. Migrating it faithfully preserves the problem. |

Files with no match at all are **Untouched** — the Migration does not reach them.

The output is a **Plan**: a per-file table you can read, argue with, split
across a team, and commit to version control.

A second axis, **Waves** — dependency depth from a topological sort of the
import graph, so leaves come before the modules that import them — is
designed but **not yet built**. Waves are *depth*; Lanes are *difficulty*;
they are independent and chutes will never mix them.

## What code decides, and what the Judge is asked

This division is the core design decision, and it is deliberate.

**Code decides everything code can decide.** Whether a file matches your Detect
Rules, what it imports, what imports it, whether it is a test file, whether it
has test coverage, how deep it sits in the graph. These are facts. They come
from globs, regexes and the import graph, and they cost nothing.

**The Judge is asked only what genuinely needs reading.** Whether a matched
change is mechanical or context-dependent. Whether the file's current shape is
worth preserving. These are judgments about code that a static rule cannot make.

Facts are never sent to the Judge to be re-derived. A Judge asked "does this
file have test coverage?" can only guess, because the answer lives in *other*
files it was never shown — so chutes computes it and states it, rather than
asking. Every question the Judge is asked is one it is actually in a position
to answer, and the answers are composed into a Lane in code, never by the
Judge.

## Accuracy is unmeasured

There is no accuracy figure in this README, because there is no accuracy figure.

A fixture suite exists (or will) to catch regressions: it checks that a change
to the questions or the composition rules does not silently change how known
files are classified. **That is a regression check, not evidence of accuracy.**
It proves chutes still does what it did yesterday. It says nothing about
whether what it did yesterday was right.

Measuring accuracy needs Calibration: a labelled sample, scored against the
tool's own confidence, to find out whether the confidence means anything. Until
that exists and has been run on real codebases, the honest claim is that the
output is a starting point for a human, and the confidence number is
uncalibrated.

## Status

| Working | Not yet |
| --- | --- |
| `chutes init` | `chutes status` and `PLAN.md` |
| `chutes init --report` | The real Judge backend |
| `chutes detect --dry-run` | Incremental rescan |
| `chutes config validate` | Waves and scheduling |
| `chutes scan` (replay Judge only) | Calibration |

## Getting started

```sh
# See what is actually in your codebase, before writing any configuration.
npx chutes init --report

# Write a configuration skeleton.
npx chutes init

# Check your Detect Rules match what you expect, without contacting the Judge.
npx chutes detect --dry-run

# See exactly what would be sent to the Judge for one file. Sends nothing.
npx chutes scan --print-state src/some/file.ts
```

Add `--json` to `init --report` when a coding agent, rather than a person, is
going to read it.

`init --report` comes first on purpose. Nobody knows what their Detect Rules
should be before seeing what is in the codebase, so chutes shows you that
first, and never tries to interview you about it.

## Feedback wanted

The most useful thing you can report right now is **a Detect Rule that fails
against a real codebase**: a pattern that matched what it should not have, or
missed what it should have caught. That is the part which cannot be worked out
from first principles, and it is the part that has to be right before
classification accuracy is even worth discussing.

Open an issue at
[github.com/PaulChen79/chutes/issues](https://github.com/PaulChen79/chutes/issues).

## Licence

[MIT](./LICENSE)
