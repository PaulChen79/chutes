/**
 * The patterns `init --report` probes for, to suggest Detect Rules.
 *
 * A Probe is deliberately *not* a Detect Rule: it is a guess offered to a
 * human, who accepts it by pasting it into their config. So a Probe is judged
 * on whether it starts a useful conversation, not on precision. Each carries
 * the same `id`/`pattern` shape a Detect Rule uses, so accepting one is a copy
 * rather than a translation.
 */
export interface Probe {
  id: string;
  /** Source text of the regex, in the form it would take in the config. */
  pattern: string;
  /** What finding this pattern tells the reader about their codebase. */
  means: string;
}

export const PROBES: Probe[] = [
  {
    id: "commonjs-require",
    pattern: "\\brequire\\s*\\(",
    means: "CommonJS imports, which an ES module Migration has to rewrite",
  },
  {
    id: "commonjs-exports",
    pattern: "\\bmodule\\.exports\\b|\\bexports\\.[A-Za-z_$]",
    means: "CommonJS exports",
  },
  {
    id: "var-declaration",
    pattern: "^\\s*var\\s+[A-Za-z_$]",
    means: "pre-ES6 variable declarations",
  },
  {
    id: "promise-chain",
    pattern: "\\.then\\s*\\(",
    means: "promise chains, which an async/await Migration unwinds",
  },
  {
    id: "callback-err-first",
    pattern: "function\\s*\\(\\s*err(or)?\\s*,",
    means: "error-first callbacks",
  },
  {
    id: "react-class-component",
    pattern: "extends\\s+(React\\.)?(Pure)?Component\\b",
    means: "React class components, which a hooks Migration rewrites",
  },
  {
    id: "react-proptypes",
    pattern: "\\bpropTypes\\b|from\\s+['\"]prop-types['\"]",
    means: "PropTypes, usually replaced by TypeScript types",
  },
  {
    id: "react-lifecycle-legacy",
    pattern: "\\bcomponentWill(Mount|ReceiveProps|Update)\\b",
    means: "deprecated React lifecycle methods",
  },
  {
    id: "vue-options-api",
    pattern: "\\bVue\\.extend\\b|export\\s+default\\s*\\{[\\s\\S]{0,200}?\\bdata\\s*\\(",
    means: "Vue Options API components",
  },
  {
    id: "jquery",
    pattern: "\\$\\(|\\bjQuery\\b",
    means: "jQuery usage",
  },
  {
    id: "typescript-any",
    pattern: ":\\s*any\\b|<any>",
    means: "explicit `any`, which a strictness Migration has to narrow",
  },
  {
    id: "ts-suppression",
    pattern: "@ts-(ignore|expect-error|nocheck)",
    means: "type errors suppressed rather than fixed",
  },
  {
    id: "non-null-assertion",
    pattern: "[A-Za-z_$\\])]!\\s*[.;,)\\]]",
    means: "non-null assertions",
  },
  {
    id: "class-decorator",
    pattern: "^\\s*@[A-Za-z_$][\\w$]*\\s*\\(",
    means: "decorators, whose semantics changed between proposals",
  },
  {
    id: "default-export",
    pattern: "^\\s*export\\s+default\\b",
    means: "default exports, which a named-exports Migration converts",
  },
  {
    id: "enzyme-test",
    pattern: "from\\s+['\"]enzyme['\"]|\\bshallow\\s*\\(|\\bmount\\s*\\(",
    means: "Enzyme tests, unsupported on modern React",
  },
  {
    id: "moment",
    pattern: "from\\s+['\"]moment['\"]|require\\(['\"]moment['\"]\\)",
    means: "Moment.js, which is in maintenance mode",
  },
  {
    id: "lodash-whole-import",
    pattern: "from\\s+['\"]lodash['\"]|require\\(['\"]lodash['\"]\\)",
    means: "whole-package lodash imports, a bundle-size Migration target",
  },
  {
    id: "css-in-js",
    pattern: "\\bstyled\\.[a-z]|\\bcss`",
    means: "CSS-in-JS, often migrated to utility classes or CSS modules",
  },
  {
    id: "global-process-env",
    pattern: "\\bprocess\\.env\\.[A-Z_]",
    means: "direct environment access, a config-layer Migration target",
  },
];

export interface ProbeHit {
  probe: Probe;
  /** How many files contain at least one match. */
  files: number;
  /** How many matches in total, across those files. */
  occurrences: number;
}

/**
 * Count each Probe's matches, both by file and in total.
 *
 * Both numbers, because they answer different questions and neither implies
 * the other. Files says how many units of work there are, which is what a
 * Lane count is made of. Occurrences says how dense the change is inside
 * them, and four files holding four hundred matches is a different job from
 * four files holding four.
 */
export function probeAll(contents: Map<string, string>): ProbeHit[] {
  const hits: ProbeHit[] = [];

  for (const probe of PROBES) {
    // Compiled once per probe, not once per file. `m` so `^` means
    // line-start, matching how Detect Rules are written; `g` so every match
    // in a file is counted rather than just the first.
    const pattern = new RegExp(probe.pattern, "gm");
    let files = 0;
    let occurrences = 0;
    for (const text of contents.values()) {
      // `matchAll` rather than a `lastIndex` loop: a pattern that can match
      // the empty string would never advance `lastIndex` and would hang.
      const found = [...text.matchAll(pattern)].length;
      if (found > 0) {
        files += 1;
        occurrences += found;
      }
    }
    if (files > 0) hits.push({ probe, files, occurrences });
  }

  return hits.sort(
    (a, b) =>
      b.files - a.files || b.occurrences - a.occurrences || a.probe.id.localeCompare(b.probe.id),
  );
}
