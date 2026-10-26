const NEGATIVE = /\b(?:not|no|never|didn't|doesn't|wasn't|isn't|failed|failure|missing|silent|pending|stuck|nahi|nahin)\b|नहीं|नही/iu;
const INSTRUCTION = /ignore (?:all |previous |the )?(?:instructions|rules)|system prompt|developer message|override policy|approve (?:the )?refund|send money|transfer funds/iu;
const KINDS = [
  ["payment", /\b(?:payment|paid|upi|transaction)\b|पेमेंट|भुगतान/iu, /\b(?:paid|success|successful|received|completed|credited)\b|हो गया|सफल/iu],
  ["ledger", /\b(?:ledger|merchant app|transaction list|dashboard|app history)\b|दिख रहा|दिखाई/iu, /\b(?:visible|shown|shows|appears|listed|credited|dikh raha hai)\b|दिख रहा|दिखाई/iu],
  ["settlement", /\b(?:bank|settlement|payout|account credit|money arrived)\b|बैंक|सेटलमेंट/iu, /\b(?:arrived|settled|credited|received)\b|आ गया|जमा/iu],
  ["soundbox", /\b(?:sound\s?box|speaker|soundpod|announcement|voice box|notification device)\b|आवाज़|बोला/iu, /\b(?:announced|spoke|rang|heard|played|bola)\b|बोला|आवाज़ आई/iu]
];
const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const WORD = Object.keys(NUMBER_WORDS).join("|");

export function redact(text) {
  return String(text ?? "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[email redacted]")
    .replace(/(?<!\d)(?:\+91[\s-]?)?[6-9]\d{9}(?!\d)/gu, "[phone redacted]")
    .replace(/(?<!\d)\d{12,19}(?!\d)/gu, "[account number redacted]");
}

function wordAmount(phrase) {
  let subtotal = 0;
  let total = 0;
  for (const word of phrase.toLowerCase().replaceAll("-", " ").split(/\s+/u)) {
    if (word === "and") continue;
    if (word === "hundred") subtotal *= 100;
    else if (word === "thousand") { total += subtotal * 1000; subtotal = 0; }
    else if (word in NUMBER_WORDS) subtotal += NUMBER_WORDS[word];
    else return null;
  }
  return total + subtotal;
}

export function normalizeSpeech(text) {
  let result = String(text ?? "")
    .replace(/\b(?:rupeeya|rupiya|rupaye)\b/giu, "rupees")
    .replace(/\b(?:nahi|nahin)\s+(?:bola|bolaa)\b/giu, "not announced")
    .replace(/\b(?:nahi|nahin)\s+(?:dikh raha hai|dikhra hai|dikha)\b/giu, "not visible")
    .replace(/(?:पाँच|पांच)\s*सौ|पंचो/gu, "₹500");
  const phrase = new RegExp(`\\b((?:(?:${WORD}|hundred|thousand|and)[\\s-]+){1,6})(?:rupees?)\\b`, "giu");
  result = result.replace(phrase, (full, words) => {
    const amount = wordAmount(words.trim());
    return amount === null ? full : `₹${amount}`;
  });
  return result.replace(/\b(?:rs\.?|rupees?)\s*(\d[\d,]*(?:\.\d{1,2})?)\b/giu, "₹$1")
    .replace(/\b(\d[\d,]*(?:\.\d{1,2})?)\s*(?:rupees?)\b/giu, "₹$1")
    .replace(/\s+/gu, " ").trim();
}

export function splitClauses(text) {
  return String(text ?? "")
    .split(/[.!?;\n]+|,\s+(?=(?:but|and|my|the|it|i|payment|bank|merchant|ledger|soundbox|speaker|settlement|device|और)\b)|\s+but\s+|\s+and\s+(?=(?:my|the|payment|bank|merchant|ledger|soundbox|speaker|settlement|device)\b)|\s+लेकिन\s+/iu)
    .map(clause => clause.trim()).filter(Boolean).slice(0, 32)
    .map((text, i) => ({ id: `S${i + 1}`, text }));
}

function claimStatus(clause, positive) {
  if (NEGATIVE.test(clause)) return "problem";
  return positive.test(clause) ? "success" : "mentioned";
}

export function extract(report) {
  const safe = redact(normalizeSpeech(report));
  const statements = splitClauses(safe);
  const claims = [];
  for (const statement of statements) {
    if (INSTRUCTION.test(statement.text)) continue;
    for (const [kind, pattern, positive] of KINDS) {
      if (pattern.test(statement.text)) claims.push({ id: `C${claims.length + 1}`, kind, status: claimStatus(statement.text, positive), source: statement.id, quote: statement.text, verified: false });
    }
  }
  const amount = statements.flatMap(statement => {
    const found = statement.text.match(/(?:₹\s*|\b(?:rs\.?)\s*)(\d[\d,]*(?:\.\d{1,2})?)/iu);
    return found ? [{ value: Number(found[1].replaceAll(",", "")), source: statement.id }] : [];
  })[0] ?? null;
  return { safe, statements, claims, amount, injectionIgnored: INSTRUCTION.test(safe) };
}

export function challenge(facts) {
  const issues = [];
  const of = kind => facts.claims.filter(claim => claim.kind === kind);
  for (const kind of ["payment", "ledger", "settlement", "soundbox"]) {
    const items = of(kind);
    if (items.some(x => x.status === "success") && items.some(x => x.status === "problem")) issues.push({ type: "contradiction", message: `Conflicting ${kind} reports; verify an authoritative record.`, sources: items.map(x => x.source) });
  }
  if (of("payment").some(x => x.status === "success") && of("ledger").some(x => x.status === "problem")) issues.push({ type: "mismatch", message: "Reported payment and merchant ledger disagree; status is unverified.", sources: [...of("payment"), ...of("ledger")].map(x => x.source) });
  if (!of("ledger").length) issues.push({ type: "missing-ledger", message: "Merchant ledger status was not supplied.", sources: [] });
  if (!of("settlement").length) issues.push({ type: "missing-settlement", message: "Bank settlement status was not supplied.", sources: [] });
  if (facts.injectionIgnored) issues.push({ type: "hidden-instruction", message: "Instruction-like report text was ignored as data.", sources: [] });
  return issues;
}

export function plan(facts, issues) {
  const of = kind => facts.claims.filter(claim => claim.kind === kind);
  const has = type => issues.some(issue => issue.type === type);
  if (has("contradiction") || has("mismatch") || of("ledger").some(x => x.status === "problem") || (of("payment").length && !of("ledger").length)) return { route: "Transaction review", question: "What status, reference, and timestamp appear in the merchant ledger?", reason: "Payment and ledger evidence need reconciliation.", action: "Human reviewer checks authoritative transaction records before any financial action." };
  if (of("ledger").length && (!of("settlement").length || of("settlement").some(x => x.status === "problem"))) return { route: "Settlement review", question: "What settlement date and bank entry can the merchant see?", reason: "Ledger and bank settlement are separate signals.", action: "Human reviewer checks settlement records; no payout or refund is initiated." };
  if (of("soundbox").some(x => x.status === "problem")) return { route: "Device support", question: "Is the device still silent after checking power, volume, connectivity, and any safe test announcement?", reason: "A silent device alone does not prove payment failure.", action: "Merchant performs safe self-checks before a device-support handoff; payment is checked separately in the ledger." };
  return { route: "General support", question: "What happened, when, and what reference is available?", reason: "The report needs basic details.", action: "Human reviewer gathers evidence; no financial action is initiated." };
}

export const providers = ["Unspecified", "Paytm", "PhonePe", "Google Pay", "BharatPe", "Other UPI provider"];

function safeProvider(value) {
  return providers.includes(value) ? value : "Unspecified";
}

export function analyze(report, id = "MHV-001", provider = "Unspecified") {
  const facts = extract(report);
  const issues = challenge(facts);
  return { id, provider: safeProvider(provider), ...facts, issues, next: plan(facts, issues), revisions: [], createdAt: new Date().toISOString() };
}

export function reviseCase(previous, report, provider = previous.provider) {
  const fresh = analyze(report, previous.id, provider);
  if (fresh.safe === previous.safe && fresh.provider === previous.provider) return previous;
  const before = { transcript: previous.safe, amount: previous.amount?.value ?? null, route: previous.next.route, provider: previous.provider };
  const after = { transcript: fresh.safe, amount: fresh.amount?.value ?? null, route: fresh.next.route, provider: fresh.provider };
  return {
    ...fresh,
    createdAt: previous.createdAt,
    updatedAt: fresh.createdAt,
    revisions: [...previous.revisions, { number: previous.revisions.length + 1, before, after, at: fresh.createdAt }]
  };
}

export function upsertCase(cases, caseFile) {
  const index = cases.findIndex(item => item.id === caseFile.id);
  return index < 0 ? [...cases, caseFile] : cases.map((item, i) => i === index ? caseFile : item);
}

export const deviceChecks = [
  { id: "ledger", label: "Check the transaction in the merchant app ledger." },
  { id: "power", label: "Check device power, charging, and volume." },
  { id: "connection", label: "Check the displayed network or connection status." },
  { id: "test", label: "If available, try a safe test announcement and note the result." }
];

export function deviceDecision(caseFile, completed = {}, stillSilent = true) {
  if (!caseFile.claims.some(claim => claim.kind === "soundbox" && claim.status === "problem")) return { stage: "not-applicable", message: "No device problem reported." };
  if (caseFile.next.route === "Transaction review") return { stage: "transaction-review", message: "Transaction evidence needs review first. Device checks cannot establish payment status." };
  const remaining = deviceChecks.filter(check => completed[check.id] !== true);
  if (!stillSilent) return { stage: "reported-resolved", message: "Merchant reports sound restored. Verify payment separately in the ledger." };
  if (remaining.length) return { stage: "self-check", message: `${remaining.length} safe device check${remaining.length === 1 ? "" : "s"} remaining before support.` };
  return { stage: "device-handoff", message: "Sound remains missing after merchant-reported checks. Prepare a device-support handoff; payment status remains unverified." };
}

export function handoff(caseFile, completed = {}, stillSilent = true) {
  const device = deviceDecision(caseFile, completed, stillSilent);
  const claims = caseFile.claims.map(claim => `- ${claim.kind}: ${claim.status} [${claim.source}]`).join("\n") || "- No supported claims";
  return [
    `Case ${caseFile.id} — merchant-reported, unverified`,
    `Provider: ${safeProvider(caseFile.provider)} (merchant-selected, not connected or verified)`,
    `Amount: ${caseFile.amount ? `₹${caseFile.amount.value} [${caseFile.amount.source}]` : "not established"}`,
    "Claims with transcript sources:", claims,
    `Open question: ${caseFile.next.question}`,
    `Route: ${caseFile.next.route} — ${caseFile.next.reason}`,
    `Next action: ${caseFile.next.action}`,
    ...(device.stage === "not-applicable" ? [] : [`Device check stage: ${device.stage} — ${device.message}`]),
    "No payment, refund, transfer, or account action was taken."
  ].join("\n");
}

export function spokenRecap(caseFile, completed = {}, stillSilent = true) {
  const device = deviceDecision(caseFile, completed, stillSilent);
  const reported = caseFile.claims.length ? caseFile.claims.map(claim => `${claim.kind} ${claim.status}`).join(", ") : "no supported claims yet";
  return `Case ${caseFile.id}. Merchant-reported signals: ${reported}. Suggested route: ${caseFile.next.route}. ${device.stage === "not-applicable" ? "" : `${device.message} `}This is not a verified payment result. Next question: ${caseFile.next.question}`;
}

export function correctionAudit(caseFile) {
  return {
    caseId: caseFile.id,
    provider: safeProvider(caseFile.provider),
    current: { transcript: caseFile.safe, amount: caseFile.amount, route: caseFile.next.route },
    revisions: caseFile.revisions.map(({ number, before, after, at }) => ({ number, before, after, at })),
    disclaimer: "Merchant reports are unverified. No financial action was taken."
  };
}
