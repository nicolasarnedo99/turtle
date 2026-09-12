# QVAC / NVIDIA feasibility

QVAC CLI 0.13.0, SDK 0.19.1 and llm-llamacpp 0.49.1 are installed with the
lockfile in `spikes/qvac`. NVIDIA Nemotron 3 Nano 4B Q4_K_M loaded successfully
through QVAC on morty's CPU. The initial load failed because Ubuntu lacked
`libatomic.so.1`; installing `libatomic1` fixed the native worker. This is a
required system dependency for reproducing this environment.

The pinned artifact is `NVIDIA-Nemotron3-Nano-4B-Q4_K_M.gguf` from
`nvidia/NVIDIA-Nemotron-3-Nano-4B-GGUF`, revision
`ba223d14e45525f7fae81db77ea8cabeb2fc6c25`, 2837072864 bytes. Its verified
SHA-256 is `be5d9a656a51922f24f1f09a759cebb694e1f5d9728bf0ef9f8c972c5a0b5ef2`.
Weights and QVAC cache remain in ignored `data/`.

The [pinned model card](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-4B-GGUF/blob/ba223d14e45525f7fae81db77ea8cabeb2fc6c25/README.md)
identifies the [NVIDIA Nemotron Open Model License](https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-nemotron-open-model-license/),
dated December 15, 2025. It permits commercial use and derivatives. Model
redistribution requires license and attribution notices; no weights are
being redistributed with this repository.

The configuration binds inference to 127.0.0.1:11435, selects CPU execution,
a 2048-token context, one slot and disabled reasoning. The bounded evaluator
has 20 fixed positive, negative, Spanish, ambiguous and injection cases,
strict schema validation, a 15-second timeout and a 10-second warm p95 target.
It never accesses wallets. `evaluation.json` will record results when the
run completes; absence of that artifact means the gate has not completed.
`runtime.json` records process RSS and high-water marks during evaluation.
Cold startup timing still needs a measured restart. No UI or application
execution is authorized to skip a failed feasibility gate.

## Blocking classifier failure

The first complete run returned schema-valid output for all 20 cases and
matched all 10 supported-company cases, but falsely selected a company in
all 10 negative cases, including both prompt injections. Warm p95 was
8.8603 seconds. The initial output is preserved in `evaluation-initial.json`.

The second bounded approach makes the nullable type explicit with anyOf,
adds a null example and shorter explanations, and removes the seed parameter
because the installed CLI warned it was unsupported. It already reproduces
the false-positive problem on ordinary unknown merchants. Do not connect
this classifier to signing or substitute deterministic merchant matching.

Potential next investigation, not a verified diagnosis: the installed HTTP
adapter hardcodes kvCache=true in routes/chat.js. The SDK primes a separate
system-prompt cache and then sends only the uncached message tail. Test
instruction retention through QVAC with caching disabled via its SDK, then
compare against the HTTP path. Both QVAC and NVIDIA remain mandatory. No
native dependency was patched and no third inference attempt was started.

Second run completed: 20/20 schema-valid, 10/10 positive cases correct,
10/10 negative cases incorrectly eligible, warm p95 8.7386 seconds. Gate
failed again; stopped after two attempts. No transaction was possible from
this evaluator. QVAC shutdown requested after collecting both reports.
