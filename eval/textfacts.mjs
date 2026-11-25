// Pulls money amounts, dates and scam warnings out of a FREE-TEXT chatbot answer,
// so a plain chatbot can be scored the same way as Samjho's structured answer.
import { asciiDigits, MONTHS, isValidIsoDate } from "../core.js";

const strip = (n) => { n = n.replace(/,/g, ""); return n.includes(".") ? n.replace(/\.?0+$/, "") : n; };

export function extractAmounts(text) {
  const t = asciiDigits(text);
  const out = new Set();
  const before = /(?:₹|\brs\.?|\binr\b|रु\.?|\brupees?\b)\s*([\d][\d,]*(?:\.\d+)?)/giu;
  const after = /([\d][\d,]*(?:\.\d+)?)\s*(?:\/-\s*)?(?:rupees|रुपये|रुपए|\brs\b)/giu;
  for (const re of [before, after]) for (const m of t.matchAll(re)) out.add(strip(m[1]));
  return [...out].filter((x) => x && x !== "0");
}

const pad = (n) => String(n).padStart(2, "0");
function monthIndex(word) {
  const w = word.toLowerCase();
  for (let i = 0; i < 12; i++) {
    const [en, ...hi] = MONTHS[i];
    if ((w.length >= 3 && w.startsWith(en)) || hi.includes(w)) return i + 1;
  }
  return 0;
}
function guessYear(month, day, today) {
  const y = +today.slice(0, 4);
  const d = Date.UTC(y, month - 1, day), t = Date.parse(today + "T00:00:00Z");
  return d < t - 60 * 86400000 ? y + 1 : y;
}

export function extractDates(text, today) {
  const t = asciiDigits(text);
  const out = new Set();
  const add = (y, m, d) => { const iso = `${y}-${pad(m)}-${pad(d)}`; if (isValidIsoDate(iso)) out.add(iso); };
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(+m[1], +m[2], +m[3]);
  for (const m of t.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/g)) add(+m[3], +m[2], +m[1]); // Indian day/month/year
  const L = "[\\p{L}\\p{M}]+";
  // 30 November 2026 / 30th Nov / 31 दिसंबर 2026
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${L})\\.?,?(?:\\s+(\\d{4}))?`, "gu"))) {
    const mo = monthIndex(m[2]); if (!mo) continue;
    const d = +m[1]; add(m[3] ? +m[3] : guessYear(mo, d, today), mo, d);
  }
  // November 30, 2026 / Dec 12th
  for (const m of t.matchAll(new RegExp(`(${L})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b,?(?:\\s+(\\d{4}))?`, "gu"))) {
    const mo = monthIndex(m[1]); if (!mo) continue;
    const d = +m[2]; add(m[3] ? +m[3] : guessYear(mo, d, today), mo, d);
  }
  return [...out].sort();
}

export function mentionsScam(text) {
  return /\b(scam|fraud|phishing|fake|suspicious|not genuine|do not share (?:the |your )?otp|don't share (?:the |your )?otp)\b|धोखाधड़ी|फर्जी|ठगी|स्कैम/i.test(text);
}
