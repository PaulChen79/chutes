# Assets

What the README embeds, and what is still missing.

| File | Status | Used by |
| --- | --- | --- |
| `banner.svg` | ✅ done | top of the README |
| `split.svg` | ✅ done | "What code decides, and what the Judge is asked" |
| `demo.gif` + `demo.mp4` | ⬜ **to record** | the hero, directly under the badges |
| `plan-md.png` | ⬜ **to capture** | "Three Lanes" |

The two missing ones are referenced from the README inside HTML comments, so
nothing renders broken while they are absent. Uncomment the markup in the
comment once the file exists.

---

## `demo.gif` + `demo.mp4` — the hero

The single highest-value asset. It should show the whole story in about thirty
seconds: *I know nothing about this repository* → *here are three piles I can
staff*.

A throwaway repository is provided so the recording is reproducible, offline,
free, and identical every time. It uses the committed fixture codebase and the
recorded Judge answers, and classifies cleanly into 12 / 12 / 12.

```sh
pnpm build
cd "$(./scripts/demo-repo.sh)"
```

### With vhs (recommended — scripted, reproducible, outputs both formats)

```sh
brew install charmbracelet/tap/vhs
pnpm build
vhs assets/demo.tape          # writes assets/demo.gif and assets/demo.mp4
```

`demo.tape` is committed next to this file. Edit the pacing there rather than
re-recording by hand.

### By hand (asciinema, if you would rather drive it yourself)

```sh
brew install asciinema agg
cd "$(./scripts/demo-repo.sh)"
asciinema rec /tmp/demo.cast
#   ... run the commands below, then exit ...
agg --font-size 16 --theme github-dark /tmp/demo.cast assets/demo.gif
```

The commands to run, in order:

```sh
chutes init --report          # the census: languages, frameworks, candidate patterns
chutes detect --dry-run --migration fixture
chutes scan --migration fixture
chutes status --migration fixture
head -40 PLAN.md
```

### Requirements

- **Width 1200px**, font size 16, a dark theme (`github-dark` matches the banner).
- Keep it **under 30 seconds** and **under 10 MB** — GitHub will not inline a
  larger GIF reliably.
- Ship the `.mp4` too. The README wraps the GIF in a link to it so the still
  image stays small and clicking gives a crisp, seekable version.

---

## `plan-md.png` — the deliverable

A screenshot of a real `PLAN.md` **as GitHub renders it**, because the rendered
table is the thing a reviewer actually reads in a pull request.

```sh
cd "$(./scripts/demo-repo.sh)"
# ... then open the generated PLAN.md on GitHub, or in any Markdown preview
```

Capture the top of the document: the summary counts and the first few rows of
the Judgment listing, so the reason column is visible. Around **1400×900**,
dark theme, no browser chrome.

---

## Editing the SVGs

`banner.svg` and `split.svg` are hand-written SVG with no external fonts or
scripts, so GitHub renders them inline on both light and dark themes. Both use
a dark background that works either way. If you edit them, check the result at
the size GitHub actually serves (roughly 880px wide) rather than full size —
text that reads fine at 1280px can close up at 880px.
