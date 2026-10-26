# MerchantHandoff Voice

A dependency-free, local merchant-support prototype. A merchant can dictate a **synthetic** issue into the intake field using Wispr Flow. The app turns that editable text into source-linked reported claims, challenges contradictory or missing evidence, and proposes a safe review route. It never checks a live transaction or executes a financial action.

## Run end to end

Requires Node.js 20 or later. No `npm install` is needed.

```bash
npm start
```

Open <http://127.0.0.1:8088>. Click **Load example** and **Investigate case**. For voice input, focus the text box and use your configured Wispr Flow dictation shortcut; review the inserted text before running the case. Edit the report and investigate again to update the **same case** and show redacted correction history. Click **New case** for a separate report. The device checklist is merchant-reported; it is not a remote diagnostic.

The public, static demo is at <https://gowtham66867.github.io/merchant-handoff-voice-wispr-flow/>. It supports the deterministic analysis, provider selection, browser read-aloud, and audit download. **Optional AI advisory is disabled on GitHub Pages** because it needs a server-side API key; run the Node server locally to test that opt-in path. The read-aloud voice comes from the browser's speech synthesis, not Wispr Flow. Wispr Flow provides external dictation into the editable report field.

Run all checks:

```bash
npm run check
```

This performs JavaScript syntax checks, unit tests (including a mocked model response), and 14 synthetic evaluation cases. Passing them does not establish that a real payment succeeded or that a route is financially correct.

## Architecture

- `server.js`: Node built-in HTTP server on 127.0.0.1:8088; serves only the app pages and `src/`. The optional `/api/assist` route is server-side.
- `src/engine.js`: deterministic extract → challenge → plan pipeline. It normalizes selected spoken rupee phrases (including `rupeeya` and the colloquial `पंचो` as ₹500), splits into numbered clauses, links claims/amounts to their source clause, flags contradictions/mismatches/missing records, and chooses transaction review, settlement review, device support, or general support. Comma-separated mixed signals have independent statuses. `पंचो` can be ambiguous in real speech and needs user confirmation.
- `src/app.mjs`: editable intake, bounded merchant-reported UPI provider, claim cards, issue flags, next question, conditional device self-check, source trace, handoff, same-case correction history, opt-in browser read-aloud, and a redacted correction-audit download. Browser memory is ephemeral; refresh resets it.
- `src/advisory.js`: optional OpenAI Responses API advisory. It sends a redacted, capped report only after a button click. JSON output is parsed and safety-checked; only one question and one uncertainty insight are accepted. The model cannot change the deterministic route or execute actions. Set `OPENAI_API_KEY` and `OPENAI_MODEL` in the server environment to enable it. The API path is tested with a mock, not a live paid call. See the [official OpenAI Responses API documentation](https://developers.openai.com/api/docs/guides/migrate-to-responses).
- `test/` and `evals/`: deterministic safety/routing checks and 14 synthetic scenarios.

## Safety limits

No Paytm, PhonePe, bank, UPI, or Soundbox API integration exists. No payment, refund, transfer, notification, or account change is performed. Merchant statements are **reported, not verified**. Redaction covers emails, Indian mobile numbers, and 12–19-digit account-like numbers in analysis/history/handoff, but **not in the editable input box**; do not enter real customer data. The language parser is bounded and may miss other speech variants. Never make financial decisions from this demo without checking authoritative records.

## Voice-build evidence

This is a **new repository created in response to a spoken Wispr Flow brief**. The [five-minute Loom recording](https://www.loom.com/share/468f040458784e91a8a6e2517c452c2b) shows the builder delivering the setup, analysis, privacy, UI, tests, advisory, and README instructions, then sending them to Codex. Codex generated the implementation in commits; the recording does **not** show all subsequent code edits or the finished test run. See [PROOF.md](PROOF.md) and [Build evidence](build.html). Do not use this recording to claim that older, separate MerchantHandoff versions were voice-built.

The post-submission reliability, provider, read-aloud, and hosting changes were requested later in Codex. The original Loom does not prove their voice-input provenance. A continuous follow-up Wispr recording would be needed for that claim.
