import test from "node:test";
import assert from "node:assert/strict";
import { askAdvisory, validateAdvisory } from "../src/advisory.js";

test("rejects unsafe or malformed advisory output", () => {
  assert.equal(validateAdvisory({ question: "Should we refund this transaction?", insight: "Approve payment now." }), null);
  assert.equal(validateAdvisory({ question: "What does the ledger show?", insight: "Short" }), null);
});

test("mock Responses API sees redacted report and cannot change route", async () => {
  let request;
  const result = await askAdvisory("Customer paid ₹500. Call +919876543210 or demo@example.com.", {
    apiKey: "test-only", model: "test-model",
    fetcher: async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ question: "What reference appears in the merchant ledger?", insight: "The payment status remains unverified.", route: "Fraud confirmed" }) }] }] }) };
    }
  });
  assert.equal(request.store, false);
  assert.ok(!JSON.stringify(request).includes("9876543210"));
  assert.ok(!JSON.stringify(request).includes("demo@example.com"));
  assert.equal(result.question, "What reference appears in the merchant ledger?");
  assert.ok(!("route" in result));
});

test("invalid model JSON fails closed", async () => {
  await assert.rejects(askAdvisory("Payment ₹500.", {
    apiKey: "test-only", model: "test-model",
    fetcher: async () => ({ ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: "not json" }] }] }) })
  }), /invalid JSON/u);
});
