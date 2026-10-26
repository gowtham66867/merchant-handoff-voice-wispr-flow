import { analyze, deviceChecks, deviceDecision, handoff, reviseCase, upsertCase } from "./engine.js";

const $ = id => document.getElementById(id);
const sample = "Customer paid one thousand five hundred rupees, but the merchant app ledger nahi dikh raha hai. My Soundbox nahi bola. Bank settlement is missing.";
let cases = [];
let current = null;

function el(tag, className, value) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value !== undefined) item.textContent = value;
  return item;
}

function checks() {
  return Object.fromEntries([...$("checks").querySelectorAll("input")].map(input => [input.value, input.checked]));
}

function summary() {
  return handoff(current, checks(), $("still-silent").checked);
}

function updateDevice() {
  if (!current) return;
  const decision = deviceDecision(current, checks(), $("still-silent").checked);
  $("device").hidden = decision.stage === "not-applicable";
  $("device-stage").textContent = decision.message;
  $("handoff").textContent = summary();
  $("copy").textContent = decision.stage === "device-handoff" ? "Copy device handoff" : "Copy case summary";
}

function render(caseFile) {
  const sameCase = current?.id === caseFile.id;
  current = caseFile;
  $("empty").hidden = true;
  $("result").hidden = false;
  $("trace").hidden = false;
  $("case-id").textContent = caseFile.id;
  $("claims").replaceChildren(...caseFile.claims.map(claim => {
    const card = el("div", "claim");
    const meta = el("div", "meta");
    meta.append(el("b", "", claim.kind.toUpperCase()), el("span", "", `${claim.status} · ${claim.source}`));
    card.append(meta, el("p", "", claim.quote));
    return card;
  }));
  $("issues").replaceChildren(...(caseFile.issues.length ? caseFile.issues.map(issue => el("div", `issue ${issue.type}`, issue.message)) : [el("div", "issue", "No structural conflict found; claims still need external verification.")]));
  $("question").textContent = caseFile.next.question;
  $("route").textContent = caseFile.next.route;
  $("reason").textContent = caseFile.next.reason;
  $("statements").replaceChildren(...caseFile.statements.map(statement => {
    const row = el("div", "statement");
    row.append(el("b", "", statement.id), el("span", "", statement.text));
    return row;
  }));
  if (!sameCase) {
    for (const input of $("checks").querySelectorAll("input")) input.checked = false;
    $("still-silent").checked = true;
  }
  updateDevice();
  $("history").hidden = caseFile.revisions.length === 0;
  $("history-count").textContent = `${caseFile.revisions.length} CORRECTION${caseFile.revisions.length === 1 ? "" : "S"}`;
  $("revisions").replaceChildren(...caseFile.revisions.map(revision => {
    const card = el("article", "revision");
    card.append(el("b", "", `REVISION ${revision.number} · SAME CASE`));
    const compare = el("div", "revision-grid");
    for (const [label, version] of [["PREVIOUS", revision.before], ["REVISED", revision.after]]) {
      const box = el("div");
      box.append(el("span", "", label), el("p", "", version.transcript), el("small", "", `₹${version.amount ?? "not established"} · ${version.route}`));
      compare.append(box);
    }
    card.append(compare);
    return card;
  }));
  $("advisory-result").hidden = true;
  $("action-status").textContent = "";
}

$("checks").replaceChildren(...deviceChecks.map(check => {
  const label = el("label", "check");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = check.id;
  input.addEventListener("change", updateDevice);
  label.append(input, el("span", "", check.label));
  return label;
}));
$("still-silent").addEventListener("change", updateDevice);
$("sample").addEventListener("click", () => { $("report").value = sample; $("report").focus(); });
$("new-case").addEventListener("click", () => {
  current = null;
  $("report").value = "";
  $("empty").hidden = false;
  $("result").hidden = true;
  $("trace").hidden = true;
  $("case-id").textContent = "AWAITING INPUT";
  $("report").focus();
});
$("investigate").addEventListener("click", () => {
  const report = $("report").value.trim();
  if (!report) { $("report").focus(); return; }
  const file = current ? reviseCase(current, report) : analyze(report, `MHV-${String(Date.now()).slice(-7)}`);
  cases = upsertCase(cases, file);
  render(file);
  document.querySelector(".result").scrollIntoView({ behavior: "smooth", block: "nearest" });
});
$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(summary()); $("action-status").textContent = "Copied."; }
  catch { $("action-status").textContent = "Clipboard unavailable; select the summary below."; }
});
$("advisory").addEventListener("click", async () => {
  if (!current) return;
  $("advisory").disabled = true;
  $("action-status").textContent = "Requesting advisory…";
  try {
    const response = await fetch("/api/assist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ report: current.safe, route: current.next.route }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Advisory unavailable.");
    $("advisory-insight").textContent = result.insight;
    $("advisory-question").textContent = result.question;
    $("advisory-result").hidden = false;
    $("action-status").textContent = "";
  } catch (error) { $("action-status").textContent = error.message; }
  finally { $("advisory").disabled = false; }
});
