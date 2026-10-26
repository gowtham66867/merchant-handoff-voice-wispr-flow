import { readFileSync } from "node:fs";
import { analyze, deviceDecision } from "../src/engine.js";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url), "utf8"));
let passed = 0;
for (const fixture of fixtures) {
  const file = analyze(fixture.text, fixture.id);
  const checks = [file.next.route === fixture.route, ...fixture.claims.map(kind => file.claims.some(claim => claim.kind === kind && file.statements.some(statement => statement.id === claim.source))), ...((fixture.issues || []).map(type => file.issues.some(issue => issue.type === type)))];
  if ("amount" in fixture) checks.push(file.amount?.value === (fixture.amount ?? undefined));
  if (fixture.device) checks.push(deviceDecision(file).stage === fixture.device);
  if (fixture.redacted) checks.push(!file.safe.includes("demo@example.com") && !file.safe.includes("9876543210"));
  const ok = checks.every(Boolean);
  passed += Number(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${fixture.id}: ${file.next.route}; ${file.claims.map(c => `${c.kind}:${c.status}`).join(", ")}`);
}
console.log(`${passed}/${fixtures.length} synthetic cases passed. These checks do not verify real payment outcomes.`);
if (passed !== fixtures.length) process.exitCode = 1;
