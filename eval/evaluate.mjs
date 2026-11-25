// Samjho AI evaluation engine. Shared by the command line (eval/run-eval.mjs)
// and the in-browser runner (eval.html), so both produce the same report.
import { explainDocument, numberTokens, callWithRetry, resultToPlainText } from "../core.js";
import { extractAmounts, extractDates, mentionsScam } from "./textfacts.mjs";

const strip = (n) => (n.includes(".") ? n.replace(/\.?0+$/, "") : n);

function score(r, ex) {
  const amounts = new Set(r.money.flatMap((m) => numberTokens(m.amount).map(strip)));
  const dates = new Set([...r.dates.map((d) => d.date), ...r.actions.map((a) => a.deadline)].filter(Boolean));
  const checks = {};
  checks.amounts = ex.amounts.every((a) => amounts.has(a));
  checks.dates = ex.dates.every((d) => dates.has(d));
  checks.no_invented_dates = [...dates].every((d) => ex.allowed_dates.includes(d));
  checks.scam = (r.scam_signals.length > 0) === ex.scam;
  checks.urgency = ex.urgency.includes(r.urgency);
  if (ex.summary_script === "devanagari") checks.language = /[ऀ-ॿ]/.test(r.summary);
  if (ex.unclear_nonempty) checks.unclear = r.unclear.length > 0;
  if (ex.max_actions !== undefined) checks.few_actions = r.actions.length <= ex.max_actions;
  const passed = Object.values(checks).every(Boolean);
  return {
    passed, checks,
    found: { amounts: [...amounts].sort(), dates: [...dates].sort(), scam: r.scam_signals.length, urgency: r.urgency },
    facts: r.stats,
    flaggedItems: [...r.actions, ...r.money, ...r.dates, ...r.warnings, ...r.scam_signals]
      .filter((x) => !x.check?.ok)
      .map((x) => ({ item: x.task || x.label || x.text, value: x.amount || x.deadline || x.date || "", quote: x.quote, why: x.check?.note || `quote ${x.check?.quote}` })),
  };
}

function expectation(f) {
  const e = f.expect, parts = [];
  if (e.amounts.length) parts.push("amounts " + e.amounts.join(", "));
  if (e.dates.length) parts.push("dates " + e.dates.join(", "));
  else parts.push("no invented dates");
  parts.push(e.scam ? "flag scam" : "no scam flag");
  if (e.summary_script) parts.push("summary in Hindi");
  if (e.unclear_nonempty) parts.push("say what is unclear");
  if (e.max_actions !== undefined) parts.push(`≤${e.max_actions} action`);
  return parts.join("; ");
}

// ---- Samjho vs plain chatbot: the same yardstick for both ----
// "wrong" = an amount that isn't in the letter at all, or a date that isn't one of the letter's dates.
const words = (t) => String(t).trim().split(/\s+/).filter(Boolean).length;
function compareSamjho(r, f) {
  const src = new Set(numberTokens(f.text).map(strip)), ex = f.expect;
  const amountItems = r.money.map((m) => ({ vals: numberTokens(m.amount).map(strip), ok: m.check?.ok }));
  const dateItems = [...r.actions.filter((a) => a.deadline).map((a) => ({ v: a.deadline, ok: a.check?.ok })), ...r.dates.map((d) => ({ v: d.date, ok: d.check?.ok }))];
  const wrong = [
    ...amountItems.filter((a) => a.vals.some((v) => !src.has(v))).map((a) => ({ ok: a.ok })),
    ...dateItems.filter((d) => !ex.allowed_dates.includes(d.v)).map((d) => ({ ok: d.ok })),
  ];
  const amounts = new Set(amountItems.flatMap((a) => a.vals)), dates = new Set(dateItems.map((d) => d.v));
  return {
    missed: ex.amounts.filter((a) => !amounts.has(a)).length + ex.dates.filter((d) => !dates.has(d)).length,
    wrongShown: wrong.filter((w) => w.ok).length, // shown with a green tick = user would trust it
    wrongCaught: wrong.filter((w) => !w.ok).length, // shown with ⚠ = user is told to check
    scam: r.scam_signals.length > 0,
    words: words(resultToPlainText(r)),
  };
}
function compareBaseline(text, f, ctx) {
  const src = new Set(numberTokens(f.text).map(strip)), ex = f.expect;
  const amounts = extractAmounts(text), dates = extractDates(text, ctx.today);
  return {
    missed: ex.amounts.filter((a) => !amounts.includes(a)).length + ex.dates.filter((d) => !dates.includes(d)).length,
    wrongShown: amounts.filter((a) => !src.has(a)).length + dates.filter((d) => !ex.allowed_dates.includes(d)).length, // a chat answer has no warnings
    wrongCaught: 0,
    scam: mentionsScam(text),
    words: words(text),
    wrongList: [...amounts.filter((a) => !src.has(a)).map((a) => "amount " + a), ...dates.filter((d) => !ex.allowed_dates.includes(d)).map((d) => "date " + d)],
  };
}
// What a typical person types into a chatbot. Deliberately ordinary, not a prompt-engineered one.
export const baselinePrompt = (f) => `Can you explain this to me in simple ${f.language}? What do I need to do, by when, and how much do I have to pay?\n\n${f.text}`;

export async function runEvaluation({ apiKey, models, repeats = 2, delay = 9000, today = "2026-11-24", fixtures, withBaseline = true,
  log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), shouldStop = () => false }) {
const all = {};
for (const model of models) {
  all[model] = [];
  for (const f of fixtures) {
    if (shouldStop()) break;
    const runs = [];
    for (let i = 0; i < repeats; i++) {
      const label = `${model} ${f.id} run ${i + 1}`;
      const t0 = Date.now();
      try {
        // no backup models here: the test must measure the model it says it measures
        const r = await explainDocument({ apiKey, model, language: f.language, input: { text: f.text }, today, sleep, onRetry: (e, n) => log(`${label}: busy, retry ${n}`, true) });
        const s = score(r, f.expect);
        runs.push({ ok: true, ms: Date.now() - t0, ...s, cmp: compareSamjho(r, f), raw: r });
        log(`${label}: ${s.passed ? "PASS" : "FAIL " + JSON.stringify(s.checks)}`);
      } catch (e) {
        runs.push({ ok: false, ms: Date.now() - t0, error: `${e.kind || "error"}: ${e.message}` });
        log(`${label}: ERROR ${e.message}`);
      }
      await sleep(delay);
    }
    const base = [];
    if (withBaseline) for (let i = 0; i < repeats; i++) {
      const label = `${model} ${f.id} plain chatbot run ${i + 1}`;
      try {
        const text = await callWithRetry({ apiKey, model, parts: [{ text: baselinePrompt(f) }], schema: null, temperature: 1 }, { sleep, onRetry: (e, n) => log(`${label}: busy, retry ${n}`, true) });
        const c = compareBaseline(text, f, { today });
        base.push({ ok: true, text, cmp: c });
        log(`${label}: missed ${c.missed}, wrong ${c.wrongShown}`);
      } catch (e) {
        base.push({ ok: false, error: e.message });
        log(`${label}: ERROR ${e.message}`);
      }
      await sleep(delay);
    }
    all[model].push({ fixture: f, runs, base });
  }
}

  // ---- markdown report ----
// ---- markdown report ----
const md = [];
md.push(`# Samjho evaluation results`, ``, `Run on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · "today" fixed to ${today} · ${repeats} run(s) per document · all test documents are fictional.`, ``);
md.push(`## Summary`, ``, `| Model | Documents fully correct | Individual checks passed | Facts matched to source | Facts flagged ⚠ | Avg time |`, `|---|---|---|---|---|---|`);
for (const model of models) {
  const runs = all[model].flatMap((x) => x.runs);
  const okRuns = runs.filter((r) => r.ok);
  const checks = okRuns.flatMap((r) => Object.values(r.checks));
  const facts = okRuns.reduce((a, r) => ({ t: a.t + r.facts.total, v: a.v + r.facts.verified }), { t: 0, v: 0 });
  const avg = okRuns.length ? Math.round(okRuns.reduce((a, r) => a + r.ms, 0) / okRuns.length / 100) / 10 : 0;
  md.push(`| ${model} | ${okRuns.filter((r) => r.passed).length}/${runs.length} runs | ${checks.filter(Boolean).length}/${checks.length} | ${facts.v}/${facts.t} | ${facts.t - facts.v} | ${avg}s |`);
}
if (withBaseline) {
  for (const model of models) {
    md.push(``, `## Samjho vs a plain chatbot (${model})`, ``,
      `Same AI model both times. "Plain chatbot" = pasting the letter with an ordinary question: *"${baselinePrompt({ language: "English", text: "" }).trim()}"*.`,
      `**Wrong fact** = an amount that is not in the letter, or a date that is not one of the letter's dates. A chat answer has no warnings, so every wrong fact reaches the reader unmarked.`, ``,
      `| Doc | Chatbot: key facts missed | Chatbot: wrong facts, no warning | Chatbot: warned of scam | Samjho: key facts missed | Samjho: wrong facts shown as ✓ | Samjho: wrong facts caught ⚠ | Samjho: warned of scam |`,
      `|---|---|---|---|---|---|---|---|`);
    const T = { bm: 0, bw: 0, sm: 0, sw: 0, sc: 0, bwords: 0, swords: 0, bn: 0, sn: 0 };
    for (const { fixture: f, runs, base } of all[model]) {
      const S = runs.filter((r) => r.ok).map((r) => r.cmp), B = base.filter((b) => b.ok).map((b) => b.cmp);
      const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0);
      const scamCell = (arr) => `${arr.filter((x) => x.scam).length}/${arr.length}${f.expect.scam ? " (should warn)" : " (should not)"}`;
      md.push(`| ${f.id} ${f.name} | ${sum(B, "missed")} | ${sum(B, "wrongShown")} | ${scamCell(B)} | ${sum(S, "missed")} | ${sum(S, "wrongShown")} | ${sum(S, "wrongCaught")} | ${scamCell(S)} |`);
      T.bm += sum(B, "missed"); T.bw += sum(B, "wrongShown"); T.sm += sum(S, "missed"); T.sw += sum(S, "wrongShown"); T.sc += sum(S, "wrongCaught");
      T.bwords += sum(B, "words"); T.swords += sum(S, "words"); T.bn += B.length; T.sn += S.length;
    }
    md.push(`| **Total** (${repeats} runs each) | **${T.bm}** | **${T.bw}** | | **${T.sm}** | **${T.sw}** | **${T.sc}** | |`, ``,
      `Average words to read: plain chatbot **${T.bn ? Math.round(T.bwords / T.bn) : "–"}**, Samjho **${T.sn ? Math.round(T.swords / T.sn) : "–"}** (Samjho's count is its read-aloud text).`, ``,
      `> Read the chatbot answers yourself in \`eval/baseline-answers.md\`. The number extractor is automatic, so check any "wrong fact" it reports, e.g. a correct total the chatbot added up itself would count here.`);
  }
}

for (const model of models) {
  md.push(``, `## ${model}`, ``, `| ID | Test document | Type | What should happen | ${Array.from({ length: repeats }, (_, i) => `Run ${i + 1}`).join(" | ")} | Same answer every run? |`, `|---|---|---|---|${"---|".repeat(repeats)}---|`);
  for (const { fixture: f, runs } of all[model]) {
    const cells = runs.map((r) => (!r.ok ? `ERROR (${r.error})` : `${r.passed ? "✅" : "❌"} amounts [${r.found.amounts.join(", ")}] dates [${r.found.dates.join(", ")}] scam:${r.found.scam ? "yes" : "no"} urgency:${r.found.urgency}${r.passed ? "" : " — failed: " + Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k).join(", ")}`));
    const sig = runs.filter((r) => r.ok).map((r) => JSON.stringify([r.found.amounts, r.found.dates, !!r.found.scam]));
    const same = sig.length === runs.length && new Set(sig).size === 1 ? "yes" : "no";
    md.push(`| ${f.id} | ${f.name} | ${f.difficulty} | ${expectation(f)} | ${cells.join(" | ")} | ${same} |`);
  }
  const flagged = all[model].flatMap(({ fixture, runs }) => runs.filter((r) => r.ok).flatMap((r) => r.flaggedItems.map((x) => ({ id: fixture.id, ...x }))));
  md.push(``, `### What the fact-checker flagged (${flagged.length})`, ``);
  if (!flagged.length) md.push(`Nothing flagged — every fact's quote was found in the document.`);
  else {
    md.push(`| Doc | Item | Value | Quote the AI gave | Why flagged | Real error? (fill in) |`, `|---|---|---|---|---|---|`);
    for (const x of flagged) md.push(`| ${x.id} | ${x.item} | ${x.value} | ${String(x.quote).replace(/\|/g, "/").slice(0, 90)} | ${x.why} | |`);
  }
}
  let baselineMd = "";
if (withBaseline) {
  const b = [`# Plain chatbot answers (for reading and quoting)`, ``];
  for (const model of models) for (const { fixture: f, base } of all[model]) base.forEach((x, i) => {
    b.push(`## ${model} · ${f.id} ${f.name} · run ${i + 1}`, ``, x.ok ? x.text : `ERROR: ${x.error}`, ``);
    if (x.ok && x.cmp.wrongList.length) b.push(`*Auto-detected not in the letter:* ${x.cmp.wrongList.join(", ")}`, ``);
  });
  baselineMd = b.join("\n");
}
  return { all, md: md.join("\n") + "\n", baselineMd };
}
