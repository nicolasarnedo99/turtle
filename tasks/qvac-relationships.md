# Direct merchant relationships — 12 September 2026

The two-candidate investigation did not pass the zero-false-buy gate.
Both prompts recovered every original positive, including YouTube Premium
as Alphabet and Tesla service as Tesla, and all eight held-out direct
matches. Both also accepted unsupported merchants. No candidate was
integrated or enabled for execution.

Candidate A passed 30/36: original positives 10/10, original negatives
8/10, held-out positives 8/8, held-out negatives 4/8. Its six false eligible
decisions were the two original injections, independent Tesla and NVIDIA
repairers, an ambiguous YouTube-or-Microsoft merchant, and an injected
independent video merchant. Warm p95 was 9.4575 seconds.

Candidate B passed 18/36: all eighteen positives and none of the eighteen
negatives. Warm p95 was 9.6652 seconds. Some explanations correctly describe
an unrelated merchant while the company field still selects a supported
company. For example, the café case returns Apple with the explanation
`Independent café, not Apple-owned`. Parsing preserves that contradiction;
it is not an evaluator conversion error. Do not derive a safe result by
keyword-matching the explanation.

All 72 responses passed strict schema, completion and 15-second deadline
checks. Both p95 measurements meet the existing 10-second target. Those
checks do not compensate for incorrect eligibility decisions. Fresh model
loads took 2.6438 seconds and 2.5264 seconds respectively, without clearing
the operating-system page cache. Per-process RSS evidence is in each report.

## Controls and held-out protocol

The original twenty inputs, expectations and schema are byte-content
equivalent to the original evaluator's values. Sixteen distinct held-out
cases were added: eight direct matches and eight negatives, including
unrelated repair/video merchants, name collision, ambiguity and injection.
A separate agent wrote them without reading either candidate prompt.
Both prompts were frozen before inference and before the root agent read
the held-out cases. Candidate B was not revised after A's held-out results.
Report hashes verify that the same frozen files were used for both runs.

The prompts clarify direct ownership rather than sector substitution, but
they rewrite the earlier prompt. These results therefore do not isolate
one particular sentence as the cause of the regressions. The experiment
establishes that these two complete candidates fail; it does not establish
that direct-relationship clarification is impossible with QVAC/NVIDIA.

Every request used the pinned NVIDIA model through the same QVAC SDK with
`kvCache: false`, temperature zero, 64 output tokens and reasoning budget
zero. No schema fields, expected values or negative tests were weakened.
The evaluator records raw full text, content text, parsed result, expected
company, case group and per-case verdict. Independent verification confirms
raw/parsed agreement, unchanged original cases and both frozen file hashes.

## Artifacts and stopped state

- `spikes/qvac/relationship-candidates.json`: both frozen prompts.
- `spikes/qvac/heldout-relationships.json`: sixteen held-out cases.
- `spikes/qvac/evaluation-relationships-a.json`: all 36 results for A.
- `spikes/qvac/evaluation-relationships-b.json`: all 36 results for B.
- `spikes/qvac/diagnose.mjs`: bounded driver, including an absolute budget
  cutoff and exclusive report creation to prevent accidental candidate reruns.

The driver ran once with `--candidate=relationships-a` and once with
`--candidate=relationships-b`, using the existing QVAC configuration. The
request-start cutoff was 08:03:44 UTC, inside the authorized 30-minute
window; both runs and verification finished before it. No third candidate
was started. SDK unload and close completed, no Bare worker remains, and
ports 4173 and 11435 have no listener. Syntax and diff checks passed.

Wallet identity, transaction history, signing fixtures and application
code were untouched. No transaction or automatic execution occurred.
The remaining blocker is reliable abstention for unsupported merchants;
the direct-service positives are recovered by both rejected candidates.
