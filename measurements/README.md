# Measurements

What chutes actually costs and how fast it actually runs, measured rather
than assumed.

## Latest run: 2026-09-19

| Figure | Assumed | **Observed** |
| --- | --- | --- |
| Cost per file | ~$0.0001 | **$0.0000419** (2.4x cheaper) |
| Throughput | ~1,000 files/min | **2,961 files/min** (3x faster) |
| Requests per file | 1 | **1** (five questions, one State) |
| Billing | Input tokens only | **Confirmed** |

1,008 files, 1,004,980 input tokens, **$0.0422**, 20.4 seconds, zero errors.
Model `jev-1.13.0`, Config Fingerprint `cf_329cf8dc61aa0370`.

Both headline figures came in better than the design assumed, so nothing in
the cost model needs rethinking. Two other things did not.

## Finding 1: nothing was classified Mechanical

**Not one of 1,008 files landed in the Mechanical Lane.** 476 went to
Judgment, 532 to Redesign.

This matters more than either headline figure. Separating the mechanical bulk
from the work that needs a person is what the tool is *for*. A run that finds
no mechanical work has either met an unusual codebase or a miscalibrated
Threshold.

The fixture is not an unusual codebase: twelve of its thirty-six files were
hand-labelled Mechanical, and they are trivial Vue components — a `Badge`
that renders a prop, a `Spacer` that renders a div.

A single-file probe shows the mechanism. `Badge.vue` came back with
`q1_direct_rewrite: 0.82`, against a `thresholds.mechanical.direct_rewrite`
of `0.85`. It missed by three hundredths and fell to Judgment, which is the
ambiguity rule working exactly as designed — ambiguity resolves toward more
human attention. The question is whether 0.85 is the right line for this
model's output distribution.

**This is written up rather than fixed.** Lowering the Threshold until the
fixture passes would be fitting the number to hand-labels written by the same
person who chose the number — precisely the error `fixtures/README.md` warns
about. Establishing where the line belongs is Calibration's job, against a
real codebase with a hand-labelled sample, and Calibration is M1.

Until then, the honest statement is the one the project README already makes:
the classification is uncalibrated, and this run is the first concrete
evidence of how uncalibrated.

## Finding 2: the documented rate limit was not enforced

The run sustained **2,961 requests per minute against a documented limit of
1,200**, with zero rejections and no `429`s.

The throughput model in the design is built on that 1,200 figure. It is not
behaving as a hard ceiling here — but the vendor's documentation says these
numbers "can change without notice", so the safe reading is that the limit is
neither reliable as a ceiling *nor* safe to plan on exceeding. Throughput
should be treated as measured-per-account, not derived from documentation.

## Also corrected by this run

The pre-flight cost estimate was under-reporting by roughly 8x, because it
counted the State and not the five question texts that travel with every
request. For a gate whose job is to stop an expensive mistake before it
happens, under-estimating is the one failure mode that defeats the purpose.
Fixed, and the characters-per-token ratio is now calibrated against observed
requests and deliberately errs high: the same file now estimates 813 tokens
against an actual 785.

## Running it again

```sh
TYPESAFE_API_KEY=... pnpm measure:cost              # ~1000 files, ~$0.04
TYPESAFE_API_KEY=... pnpm measure:cost -- --files 200   # a cheaper trial
```

Each run writes `measurements/<date>.json` with the date, the model version
that answered, and the Config Fingerprint the figures were measured under.
All three matter: a cost per file is meaningless without knowing which model
produced it and which Thresholds and questions were in force.

This is not part of the test suite. It spends real money and requires an
explicit invocation and a credential.

## Why a thousand files

Fifty fixture files cannot reveal a rate limit. As it turned out, a thousand
could not either — see Finding 2 — but it took a thousand to establish that.

## The result is allowed to be bad news

If throughput had been much lower, incremental rescan would have stopped
being a convenience and become the only workable mode. If cost had been much
higher, asking every question of every file would have needed rethinking.

Neither happened. Finding 1 did, and it is the more important result.
