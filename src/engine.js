const NEGATIVE = /\b(?:not|no|never|didn't|doesn't|wasn't|isn't|failed|failure|missing|silent|pending|stuck|nahi|nahin)\b|नहीं|नही/iu;
const INSTRUCTION = /ignore (?:all |previous |the )?(?:instructions|rules)|system prompt|developer message|override policy|approve (?:the )?refund|send money|transfer funds/iu;
const KINDS = [
  ["payment", /\b(?:payment|paid|upi|customer|transaction)\b|पेमेंट|भुगतान/iu, /\b(?:paid|success|successful|received|completed|credited)\b|हो गया|सफल/iu],
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
    .replace(/(?:पाँच|पांच)\s*सौ|पंचो/gu, "500");
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
    .split(/[.!?;\n]+|,\s+(?=(?:but|and|my|the|it|i|और)\b)|\s+but\s+|\s+लेकिन\s+/iu)
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
  if (has("contradiction") || has("mismatch") || (of("payment").length && !of("ledger").length)) return { route: "Transaction review", question: "What status, reference, and timestamp appear in the merchant ledger?", reason: "Payment and ledger evidence need reconciliation.", action: "Human reviewer checks authoritative transaction records before any financial action." };
  if (of("ledger").length && (!of("settlement").length || of("settlement").some(x => x.status === "problem"))) return { route: "Settlement review", question: "What settlement date and bank entry can the merchant see?", reason: "Ledger and bank settlement are separate signals.", action: "Human reviewer checks settlement records; no payout or refund is initiated." };
  if (of("soundbox").some(x => x.status === "problem")) return { route: "Device support", question: "Is the device still silent after checking power, volume, connectivity, and any safe test announcement?", reason: "A silent device alone does not prove payment failure.", action: "Merchant performs safe self-checks before a device-support handoff; payment is checked separately in the ledger." };
  return { route: "General support", question: "What happened, when, and what reference is available?", reason: "The report needs basic details.", action: "Human reviewer gathers evidence; no financial action is initiated." };
}

export function analyze(report, id = "MHV-001") {
  const facts = extract(report);
  const issues = challenge(facts);
  return { id, ...facts, issues, next: plan(facts, issues), revisions: [], createdAt: new Date().toISOString() };
}
