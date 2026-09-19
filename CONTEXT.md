# chutes

Per-file triage for large refactors. Given a codebase and a description of a
migration, chutes decides which files a coding agent can safely change on its
own, which need a human judgement call, and which need redesigning — then
orders that work by dependency.

The governing split: **code owns control flow, the model only makes
judgements.** Anything countable is computed in code and handed to the model as
input, never asked of it.

## Language

### The migration

**Migration**:
One coherent codebase-wide change, described by a single config file and
producing a single Plan. Two migrations running at once stay fully separate.
_Avoid_: Refactor, upgrade, codemod

**Detect Rule**:
A named pattern that identifies code belonging to the old way of doing things.
Deliberately loose — a missed Match is invisible, a spurious one is cheap.
_Avoid_: Matcher, selector, query

**Match**:
One place in one file where a Detect Rule fired, carried with its surrounding
lines. A file with no Matches is Untouched.
_Avoid_: Hit, occurrence, finding

**Criteria**:
The English prose in the config describing what this particular migration is
and what counts as a direct rewrite. Interpolated into the built-in questions;
never the questions themselves.
_Avoid_: Prompt, instructions, description

### Classification

**Lane**:
The verdict on one file: exactly one of Mechanical, Judgment, or Redesign.
Always three, never configurable — the plugin, reporting, and calibration are
all built on those three.
_Avoid_: Bucket, category, tier, class

**Mechanical**:
The Lane for a file whose every Match has a direct one-to-one rewrite, safe to
hand to an agent unsupervised.
_Avoid_: Automatic, trivial, easy

**Judgment**:
The Lane for a file needing a human decision before or during the change. Also
the default when confidence is low — uncertainty always escalates, never
de-escalates.
_Avoid_: Manual, review, uncertain

**Redesign**:
The Lane for a file where the migration changes its public API, its lifecycle
semantics, or otherwise demands rethinking rather than rewriting.
_Avoid_: Hard, blocked, rewrite

**Untouched**:
A file matched by no Detect Rule. Never sent to the Judge and absent from the
Plan, but still indexed into the dependency graph.
_Avoid_: Unaffected, skipped, excluded

**State**:
The nested JSON describing one file that is sent to the Judge: its Matches,
imports, outline, and every code-computed fact. Deliberately small.
_Avoid_: Context, payload, prompt

**Confidence**:
How strongly the evidence supports the assigned Lane, as the weakest link in
the conditions that produced it — a minimum, never a product.
_Avoid_: Score, certainty, probability

### The plan

**Plan**:
The durable, version-controlled record of one Lane per file plus its progress.
`plan.jsonl` is the source of truth; `PLAN.md` is rendered from it for humans.
_Avoid_: Report, manifest, index, results

**Wave**:
A dependency depth in the import graph — how deep a file sits, not how hard it
is. Orthogonal to Lane. Cycles collapse into a single Wave.
_Avoid_: Phase, batch, stage, round

**Gate**:
The rule deciding when a file becomes available to work on. The default is
per-file: every dependency done. Not a barrier across a whole Wave.
_Avoid_: Barrier, checkpoint, blocker

**Shard**:
A stable slice of the Plan derived from file paths, so several people or CI
jobs can work at once without locking. Replaces coordination with one-time
division.
_Avoid_: Partition, lock, claim, lease

**Demote**:
Moving a file to a Lane needing more human involvement after its change failed
repeatedly. Each Demotion is a free, real-world negative label for Calibration.
_Avoid_: Downgrade, reclassify, escalate

### Trusting the output

**Judge**:
The model backend answering the built-in questions about a file. Swappable, so
the tool does not depend on any one vendor staying available.
_Avoid_: Model, LLM, classifier, oracle

**Threshold**:
A number in the config converting the Judge's probabilities into a Lane. A
version-controlled asset, changed only alongside before-and-after Calibration
figures — not part of any prompt.
_Avoid_: Cutoff, limit, setting

**Calibration**:
Measuring how often a Lane at a given Confidence is actually right, against
hand-labelled files. Without it a Confidence number means nothing and no
Threshold can be justified.
_Avoid_: Evaluation, accuracy, benchmark, validation

**Config Fingerprint**:
A hash over everything affecting how a judgement is reached — questions,
Thresholds, combination rule, Judge model version. Stamped into the Plan; when
it changes, existing Calibration no longer applies.
_Avoid_: Version, checksum, hash

**Fixture Repo**:
A small hand-labelled codebase in this repo, used to detect classification
regressions. Catches getting worse; cannot measure being right — only a real
codebase can do that.
_Avoid_: Test repo, sample, mock project
