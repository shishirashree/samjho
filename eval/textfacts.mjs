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
  // Spaces only (never a line break) between day, month and year, so a sentence end
  // like "bill for October.\n2. What happens" is not read as "October 2" (run 2 bug).
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[ \\t]+(?:of[ \\t]+)?(${L})\\.?,?(?:[ \\t]+(\\d{4}))?`, "gu"))) {
    const mo = monthIndex(m[2]); if (!mo) continue;
    const d = +m[1]; add(m[3] ? +m[3] : guessYear(mo, d, today), mo, d);
  }
  // November 30, 2026 / Dec 12th
  for (const m of t.matchAll(new RegExp(`(${L})(\\.?)[ \\t]+(\\d{1,2})(?:st|nd|rd|th)?\\b,?(?:[ \\t]+(\\d{4}))?`, "gu"))) {
    const mo = monthIndex(m[1]); if (!mo) continue;
    if (m[2] && m[1].length > 4) continue; // "October. 2" = end of a sentence; "Dec. 12" = abbreviation, keep
    m.splice(2, 1); // drop the dot group so m[2]/m[3] are day/year again
    const d = +m[2]; add(m[3] ? +m[3] : guessYear(mo, d, today), mo, d);
  }
  return [...out].sort();
}

// True only when the answer says THIS message is a scam/fake. A general safety tip
// ("never share your OTP", "beware of any fake calls") does not count.
// Run 1 wrongly counted "किसी भी फर्जी फोन" (= "any fake call") as a scam warning.
const SCAM = "(?:scam|fraud(?:ulent)?|phishing|fake|फर्जी|फ़र्ज़ी|धोखाधड़ी|ठगी|स्कैम)";
export function mentionsScam(text) {
  const sentences = String(text).split(/(?<=[.!?।\n])/u);
  const claim = new RegExp(`(?:\\b(?:this|it|message|sms|text|notice)\\b|यह|ये|मैसेज|संदेश)[^.!?।\\n]{0,40}?${SCAM}`, "iu");
  const general = new RegExp(`(?:\\bany\\b|किसी भी|ऐसे|other)\\s*(?:\\S+\\s+){0,2}?${SCAM}`, "iu");
  return sentences.some((s) => claim.test(s) && !general.test(s.slice(Math.max(0, s.search(new RegExp(SCAM, "iu")) - 20))));
}
