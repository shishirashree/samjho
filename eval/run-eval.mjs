// Samjho AI evaluation, command-line version. (No laptop? Open eval.html on the live site instead.)
// Runs every test document through the real AI, checks the answers against
// what a person decided is correct, and writes eval/results.md.
//
// Usage (from the project folder):
//   GEMINI_API_KEY=your_key node eval/run-eval.mjs
//   GEMINI_API_KEY=your_key node eval/run-eval.mjs --models gemini-3.8-flash,gemini-3.1-flash-lite --repeats 2
// Options: --models a,b  --repeats N (default 2)  --only E1,E3  --delay ms (default 9000)  --today YYYY-MM-DD
//          --baseline no   (skip the "plain chatbot" comparison, which is ON by default)
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_MODEL } from "../core.js";
import { runEvaluation } from "./evaluate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error("Set GEMINI_API_KEY first. Get a free key at https://aistudio.google.com/apikey"); process.exit(1); }
const only = args.only ? new Set(args.only.split(",")) : null;
const fixtures = JSON.parse(await readFile(join(here, "fixtures.json"), "utf8")).filter((f) => !only || only.has(f.id));
const withBaseline = args.baseline !== "no";

const { all, md, baselineMd } = await runEvaluation({
  apiKey,
  models: (args.models || DEFAULT_MODEL).split(",").map((s) => s.trim()).filter(Boolean),
  repeats: Math.max(1, +(args.repeats || 2)),
  delay: +(args.delay || 9000),
  today: args.today || "2026-11-24",
  fixtures, withBaseline,
  log: (m) => console.log(m),
});
await writeFile(join(here, "results.json"), JSON.stringify(all, null, 2));
await writeFile(join(here, "results.md"), md);
if (withBaseline) await writeFile(join(here, "baseline-answers.md"), baselineMd);
console.log("\nWrote eval/results.md, eval/results.json" + (withBaseline ? " and eval/baseline-answers.md" : ""));
