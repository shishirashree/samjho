// app.js — everything you SEE: buttons, cards, settings.
// The thinking/checking lives in core.js.
import {
  LANGUAGES, MODEL_CHOICES, DEFAULT_MODEL, FOLLOWUP_SCHEMA,
  explainDocument, callGemini, buildFollowupPrompt, checkResult, normalizeResult,
  quoteStatus, buildIcs, calendarEvents, resultToPlainText, isoToday,
  toSavedLetter, upsertLetter, upcomingItems,
} from "./core.js";
import { SAMPLE_TEXT, SAMPLE_RESULT } from "./sample.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d = "") { try { return localStorage.getItem("samjho." + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("samjho." + k, v); } catch { /* private mode: ignore */ } },
  del(k) { try { localStorage.removeItem("samjho." + k); } catch { /* ignore */ } },
};

// ---- saved letters ("My deadlines"), kept only in this browser ----
function loadLetters() { try { return JSON.parse(store.get("letters", "[]")) || []; } catch { return []; } }
function saveLetters(list) {
  try { localStorage.setItem("samjho.letters", JSON.stringify(list)); return true; }
  catch { return false; } // storage full or blocked
}

// ---- state ----
let doc = null;        // { kind: "image"|"pdf"|"text", inlineData?, text?, name }
let lastResult = null;
let busy = false;

// ---- small DOM helper: never uses innerHTML for AI text (prevents injection) ----
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : String(c));
  return n;
}

// ---- setup ----
function init() {
  const langSel = $("lang");
  for (const l of LANGUAGES) langSel.append(el("option", { value: l.name }, l.name));
  langSel.value = store.get("lang", guessLanguage());
  langSel.addEventListener("change", () => store.set("lang", langSel.value));

  const modelSel = $("model");
  for (const m of MODEL_CHOICES) modelSel.append(el("option", { value: m }, m));
  modelSel.value = store.get("model", DEFAULT_MODEL);

  $("openSettings").onclick = () => { $("apiKey").value = store.get("key"); $("settings").showModal(); };
  $("settings").addEventListener("close", () => {
    const k = $("apiKey").value.trim();
    if (k) store.set("key", k);
    store.set("model", modelSel.value);
  });
  $("forgetKey").onclick = () => { store.del("key"); $("apiKey").value = ""; };

  $("btnCamera").onclick = () => $("camInput").click();
  $("btnFile").onclick = () => $("fileInput").click();
  $("btnText").onclick = () => { $("textWrap").classList.remove("hidden"); $("docText").focus(); };
  $("camInput").onchange = (e) => handleFile(e.target.files[0]);
  $("fileInput").onchange = (e) => handleFile(e.target.files[0]);
  $("docText").addEventListener("input", () => {
    const t = $("docText").value.trim();
    doc = t ? { kind: "text", text: t, name: "Pasted text" } : null;
    hidePreview();
    updateGo();
  });
  $("clearDoc").onclick = clearDoc;
  $("go").onclick = run;
  $("trySample").onclick = showSample;
  updateGo();
  renderDeadlines();
}

function guessLanguage() {
  const nav = (navigator.language || "en").toLowerCase();
  const hit = LANGUAGES.find((l) => l.speech.toLowerCase().startsWith(nav.slice(0, 2)));
  return hit ? hit.name : "English";
}

function updateGo() { $("go").disabled = !doc || busy; }

function clearDoc() {
  doc = null;
  $("camInput").value = ""; $("fileInput").value = ""; $("docText").value = "";
  hidePreview(); updateGo();
}
function hidePreview() { $("preview").classList.add("hidden"); }

// ---- files: shrink big photos so they upload fast on mobile data ----
const MAX_PDF_BYTES = 15 * 1024 * 1024;
async function handleFile(file) {
  if (!file) return;
  $("textWrap").classList.add("hidden"); $("docText").value = "";
  setStatus(null);
  try {
    if (file.type === "application/pdf") {
      if (file.size > MAX_PDF_BYTES) throw new Error("This PDF is larger than 15 MB. Send only the pages that matter, or take a photo instead.");
      doc = { kind: "pdf", name: file.name, inlineData: { mime_type: "application/pdf", data: await fileToBase64(file) } };
      showPreview(null, file.name);
    } else if (file.type.startsWith("image/")) {
      const { base64, url } = await shrinkImage(file, 1600, 0.85);
      doc = { kind: "image", name: file.name || "Photo", inlineData: { mime_type: "image/jpeg", data: base64 } };
      showPreview(url, file.name || "Photo");
    } else {
      throw new Error("Please choose a photo (JPG/PNG) or a PDF.");
    }
  } catch (e) {
    doc = null;
    setStatus("error", e.message || "Couldn't open that file. Try another photo.");
  }
  updateGo();
}

function showPreview(url, name) {
  $("preview").classList.remove("hidden");
  $("previewImg").classList.toggle("hidden", !url);
  $("previewIco").classList.toggle("hidden", !!url);
  if (url) $("previewImg").src = url;
  $("previewName").textContent = name;
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(new Error("Couldn't read the file."));
    r.readAsDataURL(file);
  });
}

async function shrinkImage(file, maxSide, quality) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("This image format can't be opened here. Try a JPG or PNG (iPhone: Settings → Camera → Most Compatible)."));
    i.src = url;
  });
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", quality);
  return { base64: dataUrl.split(",")[1], url };
}

// ---- main action ----
async function run() {
  if (!doc || busy) return;
  const apiKey = store.get("key");
  if (!apiKey) {
    setStatus("error", "To read your own documents, add a free Gemini API key in Settings (⚙️). Or tap “Try a sample”.");
    $("openSettings").click();
    return;
  }
  busy = true; updateGo();
  $("result").replaceChildren();
  showLoading();
  try {
    const result = await explainDocument({
      apiKey,
      model: store.get("model", DEFAULT_MODEL),
      language: $("lang").value,
      input: doc.kind === "text" ? { text: doc.text } : { inlineData: doc.inlineData },
      today: isoToday(),
    });
    setStatus(null);
    lastResult = { ...result, _language: $("lang").value, _sample: false, _pasted: doc.kind === "text" };
    renderResult(lastResult);
    if (result.is_document && result.readable) rememberLetter(lastResult, true);
  } catch (e) {
    setStatus("error", e.message || "Something went wrong. Please try again.");
    console.warn("Samjho error", e.kind, e.detail || e);
  } finally {
    busy = false; updateGo();
  }
}

function showSample() {
  const r = checkResult(normalizeResult(structuredClone(SAMPLE_RESULT)), SAMPLE_TEXT, isoToday());
  lastResult = { ...r, _language: "English", _sample: true, _pasted: true };
  setStatus("info", "This is a hand-made example for a fictional notice, shown without calling the AI. Add your API key to try your own documents.");
  renderResult(lastResult);
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

function setStatus(kind, msg) {
  const s = $("status");
  s.replaceChildren();
  if (!kind) return;
  s.append(el("div", { class: "banner " + kind }, el("span", { "aria-hidden": "true" }, kind === "error" ? "⚠️" : "ℹ️"), el("span", {}, msg)));
}

function showLoading() {
  const steps = ["Reading your document…", "Finding dates, money and things to do…", "Checking every fact against the document…"];
  const label = el("p", {}, steps[0]);
  $("status").replaceChildren(el("div", { class: "card loading" }, el("div", { class: "spinner", "aria-hidden": "true" }), label));
  let i = 0;
  const t = setInterval(() => { if (!busy) return clearInterval(t); i = Math.min(i + 1, steps.length - 1); label.textContent = steps[i]; }, 2500);
}

// ---- rendering ----
const URGENCY = {
  high: "🔴 Action needed soon",
  medium: "🟠 Needs your attention",
  low: "🟢 Good to know — nothing urgent",
  none: "🟢 Just information — no action needed",
};

function renderResult(r) {
  const out = $("result");
  out.replaceChildren();

  if (!r.is_document || !r.readable) {
    out.append(el("div", { class: "banner error" }, el("span", {}, "📷"),
      el("span", {}, r.problem || (r.is_document ? "The text is hard to read." : "This doesn't look like a document."),
        el("br"), el("small", { style: "font-weight:400" }, "Tips: lay the page flat, use daylight, fit all edges in the frame, avoid shadows."))));
    return;
  }

  out.append(el("div", { class: "banner " + r.urgency }, URGENCY[r.urgency]));

  if (r.stats.total) {
    const pct = Math.round((100 * r.stats.verified) / r.stats.total);
    out.append(el("div", { class: "trust" },
      el("span", {}, `✓ ${r.stats.verified} of ${r.stats.total} facts matched to the document`),
      el("span", { class: "bar", role: "img", "aria-label": `${pct}% matched` }, el("i", { style: `width:${pct}%` }))));
    if (!r._pasted) out.append(el("p", { class: "note", style: "margin:0 2px" }, "For photos, facts are matched against the AI's own reading of the page. Compare ⚠ items with the paper."));
  }

  // Summary card
  out.append(el("section", { class: "card" },
    el("div", { class: "doctype" }, r.doc_type),
    r.sender ? el("div", { class: "sender" }, "From: " + r.sender) : null,
    el("p", { class: "summary" }, r.summary),
    el("div", { class: "tools" },
      el("button", { class: "ghost", onclick: () => speak(resultToPlainText(r), r._language) }, "🔊 Read aloud"),
      el("button", { class: "ghost", onclick: () => share(r) }, "📤 Share"),
      r._sample ? el("button", { class: "ghost", onclick: (e) => { rememberLetter(r, false); e.target.disabled = true; e.target.textContent = "📌 Saved"; } }, "📌 Save to My deadlines") : null,
    )));

  if (r.scam_signals.length) {
    out.append(el("section", { class: "card scam" },
      el("h2", {}, "🚩 Possible scam signs"),
      el("ul", { class: "items" }, r.scam_signals.map((s) => item(s.text, null, s))),
      el("p", { class: "note" }, "Don't share OTPs, PINs or passwords. Call the official number printed on your bill or the organisation's website — not a number in this message.")));
  }

  if (r.actions.length) {
    out.append(el("section", { class: "card" },
      el("h2", {}, "✅ What you need to do"),
      el("ul", { class: "items" }, r.actions.map((a) => item(a.task, a.deadline ? dueChip(a.daysLeft, a.deadline) : null, a)))));
  }

  if (r.money.length) {
    out.append(el("section", { class: "card" },
      el("h2", {}, "💰 Money"),
      el("ul", { class: "items" }, r.money.map((m) => item(m.label, null, m, el("span", { class: "amount" }, m.amount))))));
  }

  const events = calendarEvents(r);
  if (r.dates.length) {
    out.append(el("section", { class: "card" },
      el("h2", {}, "📅 Important dates"),
      el("ul", { class: "items" }, r.dates.map((d) => item(d.label, dueChip(d.daysLeft, d.date), d))),
      events.length ? el("button", { class: "ghost", onclick: () => downloadIcs(events) }, "➕ Add to my calendar (with reminder 1 day before)") : null));
  }

  if (r.warnings.length) {
    out.append(el("section", { class: "card" },
      el("h2", {}, "⚠️ Watch out"),
      el("ul", { class: "items" }, r.warnings.map((w) => item(w.text, null, w)))));
  }

  if (r.unclear.length) {
    out.append(el("section", { class: "card" },
      el("h2", {}, "❓ Not clear in this document"),
      el("ul", {}, r.unclear.map((u) => el("li", {}, u))),
      el("p", { class: "note" }, "Ask the sender about these before you act.")));
  }

  out.append(askCard(r));

  out.append(el("section", { class: "card" },
    el("details", {}, el("summary", {}, r._pasted ? "Show the original text" : "Show what the AI read from your photo"),
      el("pre", { class: "orig" }, r.source_text))));
}

function item(text, chip, src, right = null) {
  const ok = src.check?.ok;
  const badge = el("span", { class: "badge " + (ok ? "ok" : "flag"), title: src.check?.note || "" }, ok ? "✓ in document" : "⚠ check");
  return el("li", {},
    el("div", { class: "itemhead" },
      el("div", { class: "main" }, el("div", {}, text), chip),
      right, badge),
    src.quote ? el("details", { class: "src" },
      el("summary", {}, ok ? "Where it says this" : (src.check?.note || "Couldn't match these words exactly in the document")),
      el("blockquote", {}, src.quote)) : null);
}

function dueChip(daysLeft, iso) {
  if (daysLeft === undefined || daysLeft === null) return null;
  const nice = formatDate(iso);
  if (daysLeft < 0) return el("span", { class: "chip past" }, `${nice} · passed ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago`);
  if (daysLeft === 0) return el("span", { class: "chip soon" }, `${nice} · TODAY`);
  return el("span", { class: "chip " + (daysLeft <= 14 ? "soon" : "later") }, `${nice} · in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`);
}

function formatDate(iso) {
  try { return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

// ---- My deadlines ----
function rememberLetter(r, announce) {
  const { list, replaced } = upsertLetter(loadLetters(), toSavedLetter(r));
  if (!saveLetters(list)) { if (announce) setStatus("info", "Couldn't save this letter on this device (storage is full or blocked)."); return; }
  renderDeadlines();
  if (announce) {
    const s = $("status");
    s.replaceChildren(el("div", { class: "banner info" },
      el("span", { "aria-hidden": "true" }, "📌"),
      el("span", { style: "flex:1" }, replaced ? "You scanned this letter before — updated it in My deadlines." : "Saved to My deadlines at the top of the page."),
      replaced ? null : el("button", { class: "linkish", style: "padding:0;min-height:0", onclick: () => { forgetLetter(list[0].id); s.replaceChildren(); } }, "Undo")));
  }
}

function forgetLetter(id) {
  saveLetters(loadLetters().filter((l) => l.id !== id));
  renderDeadlines();
}

function toggleDone(letterId, key) {
  const list = loadLetters();
  const l = list.find((x) => x.id === letterId);
  if (!l) return;
  l.done = l.done || {};
  if (l.done[key]) delete l.done[key]; else l.done[key] = true;
  saveLetters(list);
  renderDeadlines();
}

function openLetter(id) {
  const l = loadLetters().find((x) => x.id === id);
  if (!l?.result) return;
  lastResult = l.result;
  setStatus("info", `Saved on ${formatDate(l.savedAt.slice(0, 10))}.`);
  renderResult(l.result);
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

let clearArmed = false;
function renderDeadlines() {
  const box = $("deadlines");
  const list = loadLetters();
  box.replaceChildren();
  box.classList.toggle("hidden", !list.length);
  if (!list.length) return;
  const g = upcomingItems(list, isoToday());
  const open = g.overdue.length + g.week.length + g.later.length;
  const row = (it) => el("li", { class: "dl" },
    el("input", { type: "checkbox", id: `dl-${it.letterId}-${it.key}`, "aria-label": "Mark done: " + it.title, onchange: () => toggleDone(it.letterId, it.key) }),
    el("div", { class: "main" },
      el("label", { for: `dl-${it.letterId}-${it.key}` }, it.title, it.ok ? null : el("span", { class: "badge flag", style: "margin-left:6px" }, "⚠ check")),
      el("div", { class: "sender" }, it.sender || it.doc_type), dueChip(it.daysLeft, it.date)),
    el("button", { class: "linkish", style: "min-height:44px", onclick: () => openLetter(it.letterId) }, "Open"));
  const group = (title, items, cls) => items.length ? [el("h3", { class: "dlh " + cls }, `${title} · ${items.length}`), el("ul", { class: "items" }, items.map(row))] : null;
  const allEvents = list.flatMap((l) => l.items.filter((it) => !l.done?.[it.key] && it.date >= isoToday())
    .map((it) => ({ date: it.date, title: it.title + (l.sender ? ` — ${l.sender}` : ""), description: "Saved in Samjho" })));
  box.append(...[
    el("h2", {}, "📋 My deadlines", el("span", { class: "n" }, String(open))),
    open ? null : el("p", { class: "note", style: "margin-top:0" }, "Nothing pending. 🎉"),
    group("Overdue", g.overdue, "bad"), group("This week", g.week, "soon"), group("Later", g.later, "later"),
    el("p", { class: "note" }, `${list.length} letter${list.length === 1 ? "" : "s"} saved on this device${g.doneCount ? ` · ${g.doneCount} done` : ""}.`),
    el("div", { class: "tools" },
      allEvents.length ? el("button", { class: "ghost", onclick: () => downloadIcs(allEvents) }, "➕ All to calendar") : null,
      el("button", { class: "ghost", onclick: (e) => {
        if (!clearArmed) { clearArmed = true; e.target.textContent = "Tap again to delete all"; setTimeout(() => { clearArmed = false; renderDeadlines(); }, 4000); return; }
        clearArmed = false; saveLetters([]); renderDeadlines();
      } }, "🗑 Clear all")),
  ].flat().filter(Boolean)); // groups are arrays and empty groups are null
}

// ---- follow-up question, answered ONLY from the document ----
function askCard(r) {
  const input = el("input", { type: "text", placeholder: "e.g. Where can I pay? Can I pay late?", "aria-label": "Ask a question about this document" });
  const answer = el("div", { "aria-live": "polite" });
  const btn = el("button", { class: "ghost" }, "Ask");
  const ask = async () => {
    const q = input.value.trim();
    if (!q) return;
    const apiKey = store.get("key");
    if (!apiKey) { answer.replaceChildren(el("p", { class: "note" }, "Add your API key in Settings to ask questions.")); return; }
    btn.disabled = true; answer.replaceChildren(el("p", { class: "note" }, "Looking in the document…"));
    try {
      const res = await callGemini({
        apiKey, model: store.get("model", DEFAULT_MODEL),
        parts: [{ text: buildFollowupPrompt(r._language, r.source_text, q) }],
        schema: FOLLOWUP_SCHEMA,
      });
      const st = res.found ? quoteStatus(res.quote, r.source_text) : "none";
      answer.replaceChildren(el("div", { style: "margin-top:10px" },
        el("p", { style: "margin:0 0 4px" }, String(res.answer || "")),
        res.found ? el("details", { class: "src" },
          el("summary", {}, st === "unverified" ? "⚠ Couldn't match the source words — check the paper" : "✓ Where it says this"),
          el("blockquote", {}, String(res.quote || ""))) :
          el("p", { class: "note" }, "The document doesn't answer this. Ask the sender.")));
    } catch (e) {
      answer.replaceChildren(el("p", { class: "note" }, "⚠️ " + e.message));
    } finally { btn.disabled = false; }
  };
  btn.onclick = ask;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });
  return el("section", { class: "card" }, el("h2", {}, "💬 Ask about this document"), el("div", { class: "ask" }, input, btn), answer);
}

// ---- helpers: speak, share, calendar ----
function speak(text, language) {
  if (!("speechSynthesis" in window)) { setStatus("error", "Read aloud isn't supported in this browser."); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const code = (LANGUAGES.find((l) => l.name === language) || LANGUAGES[0]).speech;
  u.lang = code;
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(code.slice(0, 2).toLowerCase()));
  if (voice) u.voice = voice;
  else if (language !== "English") setStatus("info", `Your phone may not have a ${language} voice installed, so it might read in another accent.`);
  speechSynthesis.speak(u);
}

async function share(r) {
  const text = resultToPlainText(r) + "\n\n(Explained by Samjho — check important details with the original.)";
  try {
    if (navigator.share) { await navigator.share({ title: r.doc_type || "Samjho", text }); return; }
    await navigator.clipboard.writeText(text);
    setStatus("info", "Copied — paste it into WhatsApp or SMS.");
  } catch { /* user cancelled */ }
}

function downloadIcs(events) {
  const blob = new Blob([buildIcs(events)], { type: "text/calendar" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "samjho-deadlines.ics" });
  document.body.append(a); a.click(); a.remove();
}

init();
