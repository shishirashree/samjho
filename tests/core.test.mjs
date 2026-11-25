// Run with:  node --test tests/
// These tests check the parts of Samjho that do NOT need the internet.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quoteStatus, amountMatchesQuote, dateMatchesQuote, isValidIsoDate, checkResult, normalizeResult,
  buildIcs, calendarEvents, parseJsonLoose, callGemini, explainDocument, daysBetween, asciiDigits,
} from "../core.js";
import { SAMPLE_TEXT, SAMPLE_RESULT } from "../sample.js";

test("quote found word-for-word, ignoring punctuation and case", () => {
  assert.equal(quoteStatus("please PAY the outstanding amount on or before 30/11/2026", SAMPLE_TEXT), "verified");
});

test("quote mostly present counts as partial", () => {
  assert.equal(quoteStatus("Please pay the outstanding amount on or before 30/11/2026 to avoid power cut", SAMPLE_TEXT), "partial");
});

test("invented quote is unverified", () => {
  assert.equal(quoteStatus("A fine of Rs. 5000 will be charged by the court", SAMPLE_TEXT), "unverified");
  assert.equal(quoteStatus("", SAMPLE_TEXT), "unverified");
});

test("amount must appear inside the quote", () => {
  assert.equal(amountMatchesQuote("Rs. 2,340.00", "your bill of Rs. 2,340.00 remains unpaid"), true);
  assert.equal(amountMatchesQuote("₹2340", "your bill of Rs. 2,340.00 remains unpaid"), true);
  assert.equal(amountMatchesQuote("Rs. 3,240", "your bill of Rs. 2,340.00 remains unpaid"), false);
  assert.equal(amountMatchesQuote("₹४,२००", "कुल देय राशि ₹4,200 है"), true);
});

test("dates in many formats match the quote", () => {
  assert.equal(dateMatchesQuote("2026-11-30", "on or before 30/11/2026"), true);
  assert.equal(dateMatchesQuote("2026-12-12", "Saturday, 12 December 2026"), true);
  assert.equal(dateMatchesQuote("2026-12-12", "on the 12th of Dec"), true);
  assert.equal(dateMatchesQuote("2026-12-31", "31 दिसंबर 2026 तक जमा करें"), true);
  assert.equal(dateMatchesQuote("2026-12-31", "३१ दिसम्बर २०२६ तक"), true);
  assert.equal(dateMatchesQuote("2026-11-30", "on or before 03/11/2026"), false);
});

test("Indian digits convert to 0-9", () => {
  assert.equal(asciiDigits("४२००"), "4200");
  assert.equal(asciiDigits("௧௨"), "12");
});

test("impossible dates are rejected", () => {
  assert.equal(isValidIsoDate("2026-02-30"), false);
  assert.equal(isValidIsoDate("2026-11-30"), true);
  assert.equal(isValidIsoDate("30/11/2026"), false);
});

test("the hand-made sample passes every check", () => {
  const r = checkResult(normalizeResult(structuredClone(SAMPLE_RESULT)), SAMPLE_TEXT, "2026-11-24");
  assert.equal(r.stats.flagged, 0, JSON.stringify(r, null, 1));
  assert.equal(r.actions[0].daysLeft, 6);
});

test("a hallucinated amount gets flagged", () => {
  const bad = structuredClone(SAMPLE_RESULT);
  bad.money[0].amount = "Rs. 3,240.00"; // AI misread the number
  const r = checkResult(normalizeResult(bad), SAMPLE_TEXT, "2026-11-24");
  assert.equal(r.money[0].check.ok, false);
  assert.equal(r.stats.flagged, 1);
});

test("a hallucinated deadline gets flagged", () => {
  const bad = structuredClone(SAMPLE_RESULT);
  bad.actions[0].deadline = "2026-12-03";
  const r = checkResult(normalizeResult(bad), SAMPLE_TEXT, "2026-11-24");
  assert.equal(r.actions[0].check.ok, false);
});

test("garbage AI output is normalised instead of crashing", () => {
  const r = normalizeResult({ urgency: "extreme", actions: "nope", money: [{ amount: 5 }] });
  assert.equal(r.urgency, "low");
  assert.deepEqual(r.actions, []);
  assert.equal(r.money[0].amount, "5");
});

test("calendar file has one event per deadline with a reminder", () => {
  const r = checkResult(normalizeResult(structuredClone(SAMPLE_RESULT)), SAMPLE_TEXT, "2026-11-24");
  const ev = calendarEvents(r, "2026-11-24");
  const ics = buildIcs(ev, new Date("2026-11-24T10:00:00Z"));
  assert.match(ics, /DTSTART;VALUE=DATE:20261130/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, ev.length);
  assert.ok(ev.length >= 2);
});

test("JSON wrapped in code fences still parses", () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Sure! {"a":2} hope this helps'), { a: 2 });
  assert.throws(() => parseJsonLoose("not json"), { kind: "bad_output" });
});

test("daysBetween", () => {
  assert.equal(daysBetween("2026-11-24", "2026-11-30"), 6);
  assert.equal(daysBetween("2026-11-24", "2026-11-05"), -19);
});

// ---- network failures, simulated with a fake fetch ----
const fakeRes = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });
const geminiBody = (obj) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

test("missing key, bad key, rate limit, unknown model, offline", async () => {
  const base = { model: "m", parts: [{ text: "x" }], schema: {} };
  await assert.rejects(callGemini({ ...base, apiKey: "" }), { kind: "no_key" });
  await assert.rejects(callGemini({ ...base, apiKey: "k", fetchImpl: fakeRes(403, {}) }), { kind: "bad_key" });
  await assert.rejects(callGemini({ ...base, apiKey: "k", fetchImpl: fakeRes(400, { error: { message: "API key not valid" } }) }), { kind: "bad_key" });
  await assert.rejects(callGemini({ ...base, apiKey: "k", fetchImpl: fakeRes(429, {}) }), { kind: "rate_limit" });
  await assert.rejects(callGemini({ ...base, apiKey: "k", fetchImpl: fakeRes(404, {}) }), { kind: "model" });
  await assert.rejects(callGemini({ ...base, apiKey: "k", fetchImpl: async () => { throw new TypeError("fetch failed"); } }), { kind: "offline" });
  await assert.rejects(callGemini({ ...base, apiKey: "k", fetchImpl: fakeRes(200, { promptFeedback: { blockReason: "SAFETY" } }) }), { kind: "blocked" });
});

test("explainDocument retries once after a garbled answer", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    const body = calls === 1 ? { candidates: [{ content: { parts: [{ text: "oops not json" }] } }] } : geminiBody(SAMPLE_RESULT);
    return { ok: true, status: 200, json: async () => body };
  };
  const r = await explainDocument({ apiKey: "k", model: "m", language: "English", input: { text: SAMPLE_TEXT }, fetchImpl, today: "2026-11-24" });
  assert.equal(calls, 2);
  assert.equal(r.stats.flagged, 0);
});

test("explainDocument waits and retries once after a rate limit", async () => {
  let calls = 0, slept = 0;
  const fetchImpl = async () => {
    calls++;
    return calls === 1 ? { ok: false, status: 429, json: async () => ({}) } : { ok: true, status: 200, json: async () => geminiBody(SAMPLE_RESULT) };
  };
  await explainDocument({ apiKey: "k", model: "m", language: "English", input: { text: SAMPLE_TEXT }, fetchImpl, today: "2026-11-24", sleep: async (ms) => { slept = ms; } });
  assert.equal(calls, 2);
  assert.ok(slept > 0);
});

test("pasted text is verified against the real text, not the AI's copy", async () => {
  const lying = structuredClone(SAMPLE_RESULT);
  lying.source_text = "fake text that includes A fine of Rs. 9999";
  lying.warnings.push({ text: "You will be fined", quote: "A fine of Rs. 9999" });
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => geminiBody(lying) });
  const r = await explainDocument({ apiKey: "k", model: "m", language: "English", input: { text: SAMPLE_TEXT }, fetchImpl, today: "2026-11-24" });
  assert.equal(r.warnings.at(-1).check.ok, false);
});

// ---- My deadlines ----
import { toSavedLetter, upsertLetter, upcomingItems } from "../core.js";
const checkedSample = () => checkResult(normalizeResult(structuredClone(SAMPLE_RESULT)), SAMPLE_TEXT, "2026-11-24");

test("saved letter keeps one item per deadline day", () => {
  const l = toSavedLetter(checkedSample(), { id: "x", today: "2026-11-24" });
  // 30 Nov appears as an action AND a date -> one item; 5 Nov had already passed -> not a to-do
  assert.deepEqual(l.items.map((i) => i.date), ["2026-11-30"]);
  assert.ok(l.items.every((i) => i.ok));
});

test("scanning the same letter twice updates it and keeps ticks", () => {
  let list = [];
  const first = toSavedLetter(checkedSample(), { id: "one" });
  ({ list } = upsertLetter(list, first));
  list[0].done = { a0: true };
  const again = toSavedLetter(checkedSample(), { id: "two" });
  const res = upsertLetter(list, again);
  assert.equal(res.replaced, true);
  assert.equal(res.list.length, 1);
  assert.equal(res.list[0].id, "one");
  assert.equal(res.list[0].done.a0, true);
});

test("upcoming items are grouped into overdue / this week / later", () => {
  const l = toSavedLetter(checkedSample(), { id: "one", today: "2026-11-01" }); // scanned before 5 Nov
  const school = { id: "two", sender: "School", doc_type: "Circular", items: [{ key: "a0", date: "2026-12-12", title: "Parent meeting", ok: true }], done: {} };
  const g = upcomingItems([l, school], "2026-11-24");
  assert.deepEqual(g.overdue.map((x) => x.date), ["2026-11-05"]);
  assert.deepEqual(g.week.map((x) => x.date), ["2026-11-30"]);
  assert.deepEqual(g.later.map((x) => x.date), ["2026-12-12"]);
});

test("ticked items disappear and very old overdue items are dropped", () => {
  const l = toSavedLetter(checkedSample(), { id: "one", today: "2026-11-01" });
  l.done = { a0: true };
  const g = upcomingItems([l], "2027-03-01");
  assert.equal(g.doneCount, 1);
  assert.equal(g.overdue.length, 0); // 5 Nov is >60 days old by March
});

test("the saved list never grows past the limit", () => {
  let list = [];
  for (let i = 0; i < 40; i++) {
    const r = checkedSample(); r.sender = "Sender " + i;
    ({ list } = upsertLetter(list, toSavedLetter(r, { id: "id" + i })));
  }
  assert.equal(list.length, 30);
  assert.equal(list[0].sender, "Sender 39");
});

// ---- Google overloaded (503): wait, retry, then use a backup model ----
test("503 is reported as 'busy' with a friendly message", async () => {
  await assert.rejects(callGemini({ model: "m", parts: [], schema: {}, apiKey: "k", fetchImpl: fakeRes(503, {}) }), { kind: "busy" });
});

test("a brief overload is retried with growing waits", async () => {
  let calls = 0; const waits = [];
  const fetchImpl = async () => (++calls <= 2 ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => geminiBody(SAMPLE_RESULT) });
  const r = await explainDocument({ apiKey: "k", model: "m", language: "English", input: { text: SAMPLE_TEXT }, fetchImpl, today: "2026-11-24", sleep: async (ms) => waits.push(ms) });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [4000, 10000]);
  assert.equal(r.model_used, "m");
});

test("if the model stays overloaded, a backup model answers", async () => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url.match(/models\/([^:]+)/)[1]);
    return url.includes("main-model") ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => geminiBody(SAMPLE_RESULT) };
  };
  const r = await explainDocument({ apiKey: "k", model: "main-model", fallbackModels: ["backup-model"], language: "English", input: { text: SAMPLE_TEXT }, fetchImpl, today: "2026-11-24", sleep: async () => {} });
  assert.equal(r.model_used, "backup-model");
  assert.deepEqual(asked, ["main-model", "main-model", "main-model", "backup-model"]);
});

test("a wrong key is not retried and does not switch models", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: false, status: 403, json: async () => ({}) }; };
  await assert.rejects(explainDocument({ apiKey: "k", model: "a", fallbackModels: ["b"], language: "English", input: { text: "x" }, fetchImpl, sleep: async () => {} }), { kind: "bad_key" });
  assert.equal(calls, 1);
});

// ---- found in real run 1 ----
test("an action dated by another line of the letter is not a false alarm (E2)", () => {
  const src = "The Parent-Teacher Meeting will be held on Saturday, 12 December 2026. Students must bring their signed report card on the day of the meeting.";
  const r = checkResult(normalizeResult({
    actions: [{ task: "Bring report card", deadline: "2026-12-12", quote: "Students must bring their signed report card on the day of the meeting." }],
    dates: [{ label: "Meeting", date: "2026-12-12", quote: "will be held on Saturday, 12 December 2026" }],
  }), src, "2026-11-24");
  assert.equal(r.actions[0].check.ok, true);
  assert.match(r.actions[0].check.note, /another line/);
});

test("a date that nothing in the letter proves is still flagged (E3 'tonight')", () => {
  const src = "Your Electricity power will be disconnected tonight at 9.30 pm";
  const r = checkResult(normalizeResult({ dates: [{ label: "Cut-off", date: "2026-11-24", quote: "will be disconnected tonight at 9.30 pm" }] }), src, "2026-11-24");
  assert.equal(r.dates[0].check.ok, false);
});

test("429 waits as long as Google asks (retryDelay)", async () => {
  let calls = 0; const waits = [];
  const fetchImpl = async () => (++calls === 1
    ? { ok: false, status: 429, json: async () => ({ error: { message: "quota", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "31s" }] } }) }
    : { ok: true, status: 200, json: async () => geminiBody(SAMPLE_RESULT) });
  await explainDocument({ apiKey: "k", model: "m", language: "English", input: { text: SAMPLE_TEXT }, fetchImpl, today: "2026-11-24", sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(waits, [31000]);
});

test("a used-up DAILY quota is not retried, but a backup model is tried", async () => {
  const asked = [];
  const daily = { ok: false, status: 429, json: async () => ({ error: { message: "Quota exceeded", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } }) };
  const fetchImpl = async (url) => { asked.push(url.match(/models\/([^:]+)/)[1]); return url.includes("tired") ? daily : { ok: true, status: 200, json: async () => geminiBody(SAMPLE_RESULT) }; };
  await assert.rejects(callGemini({ apiKey: "k", model: "tired", parts: [], schema: {}, fetchImpl }), { kind: "quota_day" });
  asked.length = 0;
  const r = await explainDocument({ apiKey: "k", model: "tired", fallbackModels: ["fresh"], language: "English", input: { text: SAMPLE_TEXT }, fetchImpl, today: "2026-11-24", sleep: async () => { throw new Error("should not wait"); } });
  assert.deepEqual(asked, ["tired", "fresh"]);
  assert.equal(r.model_used, "fresh");
});

test("dates already in the past are not put in the calendar (old bill)", () => {
  const r = checkResult(normalizeResult({ dates: [{ label: "Bill date", date: "2007-06-02", quote: "02/06/2007" }] }), "Date 02/06/2007", "2026-11-25");
  assert.deepEqual(calendarEvents(r, "2026-11-25"), []);
  const s = checkResult(normalizeResult(structuredClone(SAMPLE_RESULT)), SAMPLE_TEXT, "2026-11-24");
  assert.ok(calendarEvents(s, "2026-11-24").every((e) => e.date >= "2026-11-24"));
});
