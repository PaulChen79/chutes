import type { Framework } from "./frameworks.js";
import type { LanguageCount } from "./languages.js";
import type { ProbeHit } from "./probes.js";

/**
 * Everything `init --report` observed, in one value.
 *
 * Built once and then rendered, so the prose a person reads and the JSON an
 * agent reads are provably the same observation rather than two traversals
 * that can drift apart.
 */
export interface RepoReport {
  languages: LanguageCount[];
  frameworks: Framework[];
  candidateRules: ProbeHit[];
  filesObserved: number;
  filesUnreadable: number;
}
