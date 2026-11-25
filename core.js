// core.js — the "brain" of Samjho that does NOT touch the screen.
// Everything here is plain logic, so it can run in the browser AND in Node
// (for tests and the evaluation script). Keep UI code in app.js.

export const DEFAULT_MODEL = "gemini-3.8-flash";
export const MODEL_CHOICES = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

// Languages the user can ask for. `speech` is the code the browser's
// read-aloud voice uses.
export const LANGUAGES = [
  { name: "English", speech: "en-IN" },
  { name: "Hindi", speech: "hi-IN" },
  { name: "Bengali", speech: "bn-IN" },
  { name: "Marathi", speech: "mr-IN" },
  { name: "Telugu", speech: "te-IN" },
  { name: "Tamil", speech: "ta-IN" },
  { name: "Gujarati", speech: "gu-IN" },
  { name: "Kannada", speech: "kn-IN" },
  { name: "Malayalam", speech: "ml-IN" },
  { name: "Punjabi", speech: "pa-IN" },
  { name: "Urdu", speech: "ur-IN" },
  { name: "Odia", speech: "or-IN" },
  { name: "Spanish", speech: "es-ES" },
  { name: "French", speech: "fr-FR" },
  { name: "Arabic", speech: "ar-SA" },
];

// ---------------------------------------------------------------------------
// 1. What we ask the AI for (the "schema").
// Asking for a fixed JSON shape instead of free text means the app can draw
// clear cards and check every fact, instead of showing a wall of AI text.
// ---------------------------------------------------------------------------
const quoteField = {
  type: "STRING",
  description:
    "Copy the exact words from the document that prove this item, in the document's original language. Do not translate or reword. Max 30 words.",
};

export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_document: { type: "BOOLEAN", description: "False if the input is not a letter, notice, bill, form, message or similar document." },
    readable: { type: "BOOLEAN", description: "False if the text is too blurry, cut off or dark to read reliably." },
    problem: { type: "STRING", description: "If not a document or not readable: say why and how to fix it (e.g. retake photo in better light). Otherwise empty." },
    doc_type: { type: "STRING", description: "What kind of document this is, in the output language, e.g. 'Electricity bill'." },
    sender: { type: "STRING", description: "Who sent it, as written in the document." },
    summary: { type: "STRING", description: "2-3 short, simple sentences in the output language explaining what this document is about. Use words a 12-year-old understands." },
    urgency: { type: "STRING", enum: ["none", "low", "medium", "high"], description: "high = money/penalty/legal/service-cut deadline within ~2 weeks or already passed." },
    source_text: { type: "STRING", description: "Full transcription of the document text in its original language, exactly as written." },
    actions: {
      type: "ARRAY",
      description: "Things the reader must or should do. Empty if nothing.",
      items: {
        type: "OBJECT",
        properties: {
          task: { type: "STRING", description: "The action, in the output language, starting with a verb." },
          deadline: { type: "STRING", description: "YYYY-MM-DD if the document states one, otherwise empty." },
          quote: quoteField,
        },
        required: ["task", "deadline", "quote"],
      },
    },
    money: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING", description: "What the money is for, in the output language." },
          amount: { type: "STRING", description: "Amount with currency exactly as in the document, e.g. 'Rs. 2,340.00'." },
          quote: quoteField,
        },
        required: ["label", "amount", "quote"],
      },
    },
    dates: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING", description: "What happens on this date, in the output language." },
          date: { type: "STRING", description: "YYYY-MM-DD" },
          quote: quoteField,
        },
        required: ["label", "date", "quote"],
      },
    },
    warnings: {
      type: "ARRAY",
      description: "Penalties, consequences or conditions the reader could miss.",
      items: {
        type: "OBJECT",
        properties: { text: { type: "STRING" }, quote: quoteField },
        required: ["text", "quote"],
      },
    },
    scam_signals: {
      type: "ARRAY",
      description: "Only real red flags: asks for OTP/PIN/password, unofficial payment links, threats demanding immediate payment to a personal account, spelling of official names wrong. Empty if none.",
      items: {
        type: "OBJECT",
        properties: { text: { type: "STRING" }, quote: quoteField },
        required: ["text", "quote"],
      },
    },
    unclear: {
      type: "ARRAY",
      description: "Important things the document does NOT say clearly (in the output language). Empty if none.",
      items: { type: "STRING" },
    },
  },
  required: [
    "is_document", "readable", "problem", "doc_type", "sender", "summary", "urgency",
    "source_text", "actions", "money", "dates", "warnings", "scam_signals", "unclear",
  ],
};

export function buildPrompt(language, today = isoToday()) {
  return [
    "You help people understand official letters, bills, notices, school circulars and messages.",
    `Today's date is ${today}.`,
    `Write every explanation field in ${language}. Keep 'quote' and 'source_text' in the document's ORIGINAL language and wording.`,
    "Rules:",
    "1. Only state facts that are written in the document. Never guess amounts, dates or names.",
    "2. Every action, amount, date, warning and scam signal MUST have a quote copied word-for-word from the document.",
    "3. If something important is missing (e.g. no deadline), add it to 'unclear' instead of inventing it.",
    "4. Use very simple words. Short sentences. No legal jargon.",
    "5. If the input is not a document, or is unreadable, set is_document/readable to false, explain in 'problem', and leave the lists empty.",
    "6. Convert dates to YYYY-MM-DD. If the year is missing, use the next occurrence after today and mention it in 'unclear'.",
  ].join("\n");
}

export const FOLLOWUP_SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN", description: "True only if the document contains the answer." },
    answer: { type: "STRING", description: "Short, simple answer in the output language. If not found, say the document does not say." },
    quote: quoteField,
  },
  required: ["found", "answer", "quote"],
};

export function buildFollowupPrompt(language, sourceText, question) {
  return [
    `Answer the question using ONLY this document. Reply in ${language}, simply.`,
    "If the document does not contain the answer, set found=false and say so. Do not use outside knowledge.",
    "DOCUMENT:\n" + sourceText,
    "QUESTION: " + question,
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// 2. Talking to Gemini.
// ---------------------------------------------------------------------------
export class SamjhoError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.kind = kind; // "no_key" | "offline" | "bad_key" | "rate_limit" | "quota_day" | "busy" | "model" | "too_big" | "blocked" | "bad_output" | "server"
    Object.assign(this, extra);
  }
}

export async function callGemini({ apiKey, model, parts, schema, fetchImpl = fetch, temperature = 0.1 }) {
  if (!apiKey) throw new SamjhoError("no_key", "Add your free Gemini API key in Settings first.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    contents: [{ role: "user", parts }],
    // schema === null means "plain chat answer" (used only by the baseline comparison)
    generationConfig: schema === null ? { temperature } : { responseMimeType: "application/json", responseSchema: schema, temperature },
  };
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new SamjhoError("offline", "Couldn't reach the AI service. Check your internet connection and try again.");
  }
  if (!res.ok) {
    let detail = "", retryAfterMs = 0, quotaIds = "";
    try {
      const err = (await res.json())?.error;
      detail = err?.message || "";
      // Google says how long to wait, e.g. details: [{ retryDelay: "31s" }]
      const delay = (err?.details || []).map((d) => d?.retryDelay).find(Boolean);
      if (delay) retryAfterMs = Math.ceil(parseFloat(delay) * 1000) || 0;
      // Which limit was hit? e.g. quotaId "GenerateRequestsPerDayPerProjectPerModel-FreeTier"
      quotaIds = (err?.details || []).flatMap((d) => (d?.violations || []).map((v) => v?.quotaId || "")).join(" ");
    } catch { /* ignore */ }
    if (res.status === 429 && /per ?day/i.test(quotaIds + " " + detail))
      throw new SamjhoError("quota_day", `Today's free limit for ${model} is used up. It resets every day at midnight California time (1:30 PM in India). Pick another model in Settings, or try again later.`, { detail, quotaIds });
    if (res.status === 429) throw new SamjhoError("rate_limit", "The free AI quota is busy. Wait a minute and try again.", { detail, retryAfterMs, quotaIds });
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(detail)))
      throw new SamjhoError("bad_key", "Your API key was rejected. Check it in Settings.", { detail });
    if (res.status === 404) throw new SamjhoError("model", `The model "${model}" isn't available. Pick another model in Settings.`, { detail });
    if (res.status === 413) throw new SamjhoError("too_big", "The file is too large. Try a smaller photo or fewer pages.", { detail });
    if ([500, 502, 503, 504].includes(res.status))
      throw new SamjhoError("busy", "Google's AI is overloaded right now. Please try again in a minute.", { detail, status: res.status });
    throw new SamjhoError("server", `The AI service returned an error (${res.status}). Try again.`, { detail });
  }
  const data = await res.json();
  const cand = data?.candidates?.[0];
  if (!cand) {
    const reason = data?.promptFeedback?.blockReason;
    throw new SamjhoError("blocked", reason ? `The AI refused this input (${reason}).` : "The AI returned nothing. Try again.");
  }
  const text = (cand.content?.parts || []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
  return schema === null ? text : parseJsonLoose(text);
}

// Models occasionally wrap JSON in ``` fences. Strip them before parsing.
export function parseJsonLoose(text) {
  if (typeof text !== "string" || !text.trim()) throw new SamjhoError("bad_output", "The AI gave an empty answer.");
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a !== -1 && b > a) {
      try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ }
    }
    throw new SamjhoError("bad_output", "The AI's answer was garbled.");
  }
}

// Retry temporary failures: a garbled answer once; an overloaded service after
// 4s then 10s; a used-up free quota (429) after the wait Google suggests, or
// 20s then 40s (the free tier counts requests per minute, so short waits don't help).
export const RETRY_WAITS = [4000, 10000];
export const RATE_LIMIT_WAITS = [20000, 40000];
export async function callWithRetry(opts, { sleep = defaultSleep, onRetry = () => {} } = {}) {
  let garbled = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await callGemini(opts);
    } catch (e) {
      if (e.kind === "bad_output" && garbled++ < 1) continue;
      const temporary = e.kind === "busy" || e.kind === "rate_limit";
      if (!temporary || attempt >= RETRY_WAITS.length) throw e;
      onRetry(e, attempt + 1);
      const wait = e.kind === "rate_limit" ? Math.min(60000, Math.max(RATE_LIMIT_WAITS[attempt], e.retryAfterMs || 0)) : RETRY_WAITS[attempt];
      await sleep(wait);
    }
  }
}

// Full pipeline. If the chosen model stays overloaded (or is retired), try the
// backup models in order. The result says which model answered (`model_used`).
export async function explainDocument({ apiKey, model, language, input, fetchImpl, today, sleep = defaultSleep, fallbackModels = [], onRetry }) {
  const parts = [{ text: buildPrompt(language, today) }];
  if (input.text) parts.push({ text: "DOCUMENT TEXT:\n" + input.text });
  if (input.inlineData) parts.push({ inline_data: input.inlineData }); // {mime_type, data(base64)}
  const models = [model, ...fallbackModels.filter((m) => m && m !== model)];
  let raw, used, lastErr;
  for (const m of models) {
    try {
      raw = await callWithRetry({ apiKey, model: m, parts, schema: RESPONSE_SCHEMA, fetchImpl }, { sleep, onRetry });
      used = m;
      break;
    } catch (e) {
      lastErr = e;
      if (!["busy", "rate_limit", "quota_day", "model"].includes(e.kind)) throw e; // other errors won't be fixed by another model
    }
  }
  if (!raw) throw lastErr;
  // For pasted text we KNOW the real document text, so verify against that,
  // not against the AI's own transcription.
  const groundTruth = input.text || raw.source_text || "";
  const result = checkResult(normalizeResult(raw), groundTruth, today);
  result.model_used = used;
  return result;
}

// ---------------------------------------------------------------------------
// 3. Checking the AI's work (our anti-hallucination layer).
// ---------------------------------------------------------------------------
export function normalizeResult(r) {
  const arr = (x) => (Array.isArray(x) ? x : []);
  return {
    is_document: r?.is_document !== false,
    readable: r?.readable !== false,
    problem: String(r?.problem || ""),
    doc_type: String(r?.doc_type || ""),
    sender: String(r?.sender || ""),
    summary: String(r?.summary || ""),
    urgency: ["none", "low", "medium", "high"].includes(r?.urgency) ? r.urgency : "low",
    source_text: String(r?.source_text || ""),
    actions: arr(r?.actions).map((a) => ({ task: String(a?.task || ""), deadline: String(a?.deadline || ""), quote: String(a?.quote || "") })),
    money: arr(r?.money).map((m) => ({ label: String(m?.label || ""), amount: String(m?.amount || ""), quote: String(m?.quote || "") })),
    dates: arr(r?.dates).map((d) => ({ label: String(d?.label || ""), date: String(d?.date || ""), quote: String(d?.quote || "") })),
    warnings: arr(r?.warnings).map((w) => ({ text: String(w?.text || ""), quote: String(w?.quote || "") })),
    scam_signals: arr(r?.scam_signals).map((w) => ({ text: String(w?.text || ""), quote: String(w?.quote || "") })),
    unclear: arr(r?.unclear).map(String),
  };
}

// Lowercase, unify unicode, drop punctuation, squash spaces.
// \p{L} = any letter in any script (Hindi, Tamil...), \p{N} = digits, \p{M} = vowel signs.
export function normalizeText(s) {
  return String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}

// Does the quote really appear in the document?
// "verified"  = appears word-for-word (ignoring punctuation/case)
// "partial"   = at least 80% of its words appear in the document
// "unverified"= otherwise, or no quote given
export function quoteStatus(quote, source) {
  const q = normalizeText(quote);
  const s = normalizeText(source);
  if (!q || !s) return "unverified";
  if (s.includes(q)) return "verified";
  const qWords = q.split(" ");
  const sWords = new Set(s.split(" "));
  const hit = qWords.filter((w) => sWords.has(w)).length;
  return hit / qWords.length >= 0.8 ? "partial" : "unverified";
}

// Month names: English prefixes + Hindi/Marathi spellings (Devanagari).
export const MONTHS = [
  ["jan", "जनवरी"], ["feb", "फरवरी", "फ़रवरी", "फेब्रुवारी"], ["mar", "मार्च"], ["apr", "अप्रैल", "एप्रिल"],
  ["may", "मई", "मे"], ["jun", "जून"], ["jul", "जुलाई", "जुलै"], ["aug", "अगस्त", "ऑगस्ट"],
  ["sep", "सितंबर", "सितम्बर", "सप्टेंबर"], ["oct", "अक्टूबर", "अक्तूबर", "ऑक्टोबर"],
  ["nov", "नवंबर", "नवम्बर", "नोव्हेंबर"], ["dec", "दिसंबर", "दिसम्बर", "डिसेंबर"],
];

// Indian-language digits (०१२, ০১২, ௦௧௨ ...) -> 0-9 so "₹४,२००" matches "4200".
const DIGIT_ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66];
export function asciiDigits(s) {
  return String(s).normalize("NFKC").replace(/\p{Nd}/gu, (ch) => {
    const c = ch.codePointAt(0);
    for (const z of DIGIT_ZEROS) if (c >= z && c <= z + 9) return String(c - z);
    return ch;
  });
}

// Pull plain number tokens out of text: "Rs. 2,340.00" -> ["2340.00"]
export function numberTokens(s) {
  return (asciiDigits(s).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, ""));
}

// Is the amount the AI reported actually inside its own quote?
export function amountMatchesQuote(amount, quote) {
  const a = numberTokens(amount).map(stripZeros);
  if (!a.length) return false;
  const q = new Set(numberTokens(quote).map(stripZeros));
  return a.every((n) => q.has(n));
}
function stripZeros(n) { return n.includes(".") ? n.replace(/\.?0+$/, "") : n; }

// Is the YYYY-MM-DD date consistent with the words in the quote?
// We need the day number AND (month number or month name) to appear.
export function dateMatchesQuote(iso, quote) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return false;
  const day = String(+m[3]), month = +m[2];
  const raw = asciiDigits(quote).toLowerCase();
  // split into words in any script; "05/12/2026" -> ["5","12","2026"]
  const parts = raw.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).map((t) => (/^\d+$/.test(t) ? String(+t) : t));
  const all = new Set(parts);
  const dayOk = all.has(day) || parts.some((p) => p === day + "st" || p === day + "nd" || p === day + "rd" || p === day + "th");
  const names = MONTHS[month - 1];
  const monthOk = all.has(String(month)) || parts.some((p) => p.startsWith(names[0]) || names.slice(1).includes(p));
  return dayOk && monthOk;
}

export function isValidIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function daysBetween(fromIso, toIso) {
  const a = Date.parse(fromIso + "T00:00:00Z"), b = Date.parse(toIso + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

// Attach a `check` to every item:
//   { quote: "verified"|"partial"|"unverified", value: true|false|null, note }
// and compute overall stats. The UI shows a green tick only when both pass.
export function checkResult(r, source, today = isoToday()) {
  const stats = { total: 0, verified: 0, flagged: 0 };
  const mark = (item, valueOk, note = "") => {
    const q = quoteStatus(item.quote, source);
    const ok = q !== "unverified" && valueOk !== false;
    item.check = { quote: q, value: valueOk, note, ok };
    stats.total++;
    if (ok) stats.verified++; else stats.flagged++;
  };
  // Dates the document itself proves: an item whose quote is found AND contains its date.
  // An action like "bring the report card on the day of the meeting" (12 Dec) can't
  // show the date in its own quote, but if another verified quote proves 12 Dec is a
  // date in this letter, that's good enough. Found in real test run 1 (E2).
  for (const a of r.actions) if (a.deadline && !isValidIsoDate(a.deadline)) a.deadline = "";
  const proven = new Set([
    ...r.actions.filter((a) => a.deadline && dateMatchesQuote(a.deadline, a.quote) && quoteStatus(a.quote, source) !== "unverified").map((a) => a.deadline),
    ...r.dates.filter((d) => isValidIsoDate(d.date) && dateMatchesQuote(d.date, d.quote) && quoteStatus(d.quote, source) !== "unverified").map((d) => d.date),
  ]);
  const dateCheck = (iso, quote, missing) => {
    if (dateMatchesQuote(iso, quote)) return [true, ""];
    if (proven.has(iso)) return [true, "Date confirmed by another line of the document"];
    return [false, missing];
  };
  for (const a of r.actions) {
    const [v, note] = a.deadline ? dateCheck(a.deadline, a.quote, "Deadline not found in the document") : [null, ""];
    mark(a, v, note);
    if (a.deadline) a.daysLeft = daysBetween(today, a.deadline);
  }
  for (const m of r.money) {
    const v = amountMatchesQuote(m.amount, m.quote);
    mark(m, v, v ? "" : "Amount not found in the quoted words");
  }
  for (const d of r.dates) {
    const valid = isValidIsoDate(d.date);
    const [v, note] = valid ? dateCheck(d.date, d.quote, "Date not found in the document") : [false, "Not a real date"];
    mark(d, v, note);
    if (valid) d.daysLeft = daysBetween(today, d.date);
  }
  for (const w of r.warnings) mark(w, null);
  for (const w of r.scam_signals) mark(w, null);
  r.stats = stats;
  return r;
}

// ---------------------------------------------------------------------------
// 4. Calendar file (.ics) so the user can save deadlines in one tap.
// ---------------------------------------------------------------------------
export function buildIcs(events, now = new Date()) {
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Samjho//EN", "CALSCALE:GREGORIAN"];
  events.forEach((ev, i) => {
    if (!isValidIsoDate(ev.date)) return;
    const d = ev.date.replace(/-/g, "");
    const next = new Date(Date.parse(ev.date + "T00:00:00Z") + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:samjho-${d}-${i}-${stamp}@samjho`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${esc(ev.title)}`,
      `DESCRIPTION:${esc(ev.description || "")}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(ev.title)}`, "TRIGGER:-P1D", "END:VALARM",
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function calendarEvents(r) {
  const seen = new Set();
  const out = [];
  const add = (date, title, quote) => {
    if (!isValidIsoDate(date) || seen.has(date + title)) return;
    seen.add(date + title);
    out.push({ date, title: title + (r.sender ? ` — ${r.sender}` : ""), description: `From the document: "${quote}"` });
  };
  r.actions.forEach((a) => a.deadline && add(a.deadline, a.task, a.quote));
  r.dates.forEach((d) => add(d.date, d.label, d.quote));
  return out;
}

// Plain text version for "Read aloud" and "Share".
export function resultToPlainText(r) {
  const lines = [];
  if (r.doc_type) lines.push(r.doc_type + (r.sender ? ` — ${r.sender}` : ""));
  if (r.summary) lines.push(r.summary);
  if (r.actions.length) lines.push("To do:", ...r.actions.map((a) => `• ${a.task}${a.deadline ? ` (${a.deadline})` : ""}`));
  if (r.money.length) lines.push("Money:", ...r.money.map((m) => `• ${m.label}: ${m.amount}`));
  if (r.warnings.length) lines.push("Watch out:", ...r.warnings.map((w) => `• ${w.text}`));
  if (r.scam_signals.length) lines.push("Possible scam signs:", ...r.scam_signals.map((w) => `• ${w.text}`));
  return lines.join("\n");
}

export function isoToday(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

function defaultSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// 5. "My deadlines": remember every letter and list what's coming up.
// A chatbot forgets each conversation; Samjho keeps one list for the household.
// ---------------------------------------------------------------------------
export const MAX_SAVED = 30;

// A short, stable fingerprint so scanning the same letter twice updates it
// instead of adding a duplicate.
export function letterFingerprint(r) {
  const firstAmount = r.money[0] ? numberTokens(r.money[0].amount).join("") : "";
  const firstDate = [...r.actions.map((a) => a.deadline), ...r.dates.map((d) => d.date)].filter(Boolean).sort()[0] || "";
  return normalizeText([r.sender, r.doc_type, firstAmount, firstDate].join(" ")).slice(0, 160);
}

// Turn a checked result into the small record we keep.
export function toSavedLetter(r, { now = new Date(), id, today = isoToday(now) } = {}) {
  const items = [];
  const seenDates = new Set();
  r.actions.forEach((a, i) => {
    if (!isValidIsoDate(a.deadline)) return;
    seenDates.add(a.deadline);
    items.push({ key: "a" + i, date: a.deadline, title: a.task, ok: !!a.check?.ok });
  });
  r.dates.forEach((d, i) => {
    if (!isValidIsoDate(d.date) || seenDates.has(d.date)) return; // an action already covers this day
    if (d.date < today) return; // a date that had already passed when scanned is history, not a to-do
    items.push({ key: "d" + i, date: d.date, title: d.label, ok: !!d.check?.ok });
  });
  return {
    id: id || "L" + now.getTime().toString(36) + Math.random().toString(36).slice(2, 6),
    fingerprint: letterFingerprint(r),
    savedAt: now.toISOString(),
    doc_type: r.doc_type,
    sender: r.sender,
    urgency: r.urgency,
    money: r.money.slice(0, 1).map((m) => m.amount)[0] || "",
    items,
    done: {},
    result: r, // full result so the letter can be reopened and questioned later
  };
}

// Add or update a letter in the saved list. Returns { list, replaced }.
export function upsertLetter(list, letter) {
  const idx = list.findIndex((l) => l.fingerprint && l.fingerprint === letter.fingerprint);
  let out;
  if (idx >= 0) {
    letter = { ...letter, id: list[idx].id, done: list[idx].done || {} }; // keep ticks the user already made
    out = [letter, ...list.slice(0, idx), ...list.slice(idx + 1)];
  } else {
    out = [letter, ...list];
  }
  return { list: out.slice(0, MAX_SAVED), replaced: idx >= 0 };
}

// Every open deadline across all letters, sorted and grouped.
// Overdue items older than `overdueWindow` days are dropped so old letters don't nag forever.
export function upcomingItems(list, today = isoToday(), overdueWindow = 60) {
  const groups = { overdue: [], week: [], later: [], doneCount: 0 };
  for (const l of list) {
    for (const it of l.items || []) {
      if (l.done?.[it.key]) { groups.doneCount++; continue; }
      const daysLeft = daysBetween(today, it.date);
      if (daysLeft < -overdueWindow) continue;
      const row = { ...it, daysLeft, letterId: l.id, sender: l.sender, doc_type: l.doc_type };
      if (daysLeft < 0) groups.overdue.push(row);
      else if (daysLeft <= 7) groups.week.push(row);
      else groups.later.push(row);
    }
  }
  for (const k of ["overdue", "week", "later"]) groups[k].sort((a, b) => a.date.localeCompare(b.date));
  return groups;
}
