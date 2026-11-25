# Samjho — understand any letter, in your language

**Samjho** (Hindi for *"understand"*) helps people who get confusing official letters, like electricity bills, school circulars, tax notices, bank letters and suspicious SMS messages. Take a photo, and Samjho tells you in simple words and in your language:

- **What this is** and who sent it
- **What you need to do**, and **by when** (with a countdown)
- **How much money** is involved
- **What to watch out for**, including **possible scam signs**
- **What the letter doesn't say clearly**

**Every fact is checked against the document.** The AI has to copy the exact words that prove each fact. Samjho then checks that those words really appear in the document and that the amount or date is inside them. Facts that pass get **✓ in document**. Facts that fail get **⚠ check**, so the user knows which ones to verify.

## Features
| Feature | Why it matters |
|---|---|
| Photo / PDF / paste text input | Works with paper letters, PDFs and SMS |
| 15 output languages | People can read it in the language they think in |
| Quote-based fact checking | Stops the AI from quietly making up amounts and dates |
| Deadline countdown + "Add to calendar" (.ics with a 1-day reminder) | One tap instead of copying dates by hand |
| 🔊 Read aloud | Helps people who find reading hard |
| 📤 Share to WhatsApp/SMS | Easy to send to a family member who handles it |
| 💬 Ask a question, answered only from the document | No made-up outside answers |
| 📋 My deadlines | Every scanned letter is remembered on the device. One list shows what's overdue, due this week and later, with tick-to-done. A chatbot forgets each conversation. |
| Scam signals card | Catches OTP or urgent-payment fraud |

## Run it
No build step and nothing to install. It is three plain files: `index.html`, `app.js` and `core.js`.

1. Get a free Gemini API key at <https://aistudio.google.com/apikey> (no card needed).
2. Serve the folder: `python3 -m http.server 8080`, then open <http://localhost:8080>.
   (Opening `index.html` directly with `file://` will not work, because browsers block ES modules there.)
3. Tap ⚙️ and paste your key. The key is stored only in your browser's localStorage.
4. Tap **Try a sample** to preview without a key. This shows a hand-made example and does not call the AI.

**Live version:** enable GitHub Pages (Settings → Pages → Deploy from branch → `main` / root).

**Needs:** a modern browser, internet access, and a free Gemini API key. Costs nothing on the free tier. The free tier has per-minute and per-day limits, and Samjho shows a message when you hit them.

## Tests
```bash
npm test                      # 26 offline unit tests (fact checker, dates, calendar, deadlines list, error handling)
GEMINI_API_KEY=... npm run eval -- --models gemini-3.8-flash,gemini-3.1-flash-lite --repeats 2
```
**No laptop?** Open `eval.html` on the live site (link at the bottom of the app) and tap **Run the test**. It runs the same evaluation in your browser and lets you copy or download the reports.

The evaluation runs 7 **fictional** test documents through the real AI. That includes a Hindi notice, a scam SMS, a vague landlord message and a non-document. It writes `eval/results.md`.

**Samjho vs a plain chatbot.** The evaluation also pastes each letter into the *same* model with an ordinary question (*"Can you explain this to me in simple English? What do I need to do, by when, and how much do I have to pay?"*). It then scores both the same way: key facts missed, wrong amounts and dates reaching the reader without a warning, and whether a scam was flagged. The chatbot's answers are saved in `eval/baseline-answers.md` so anyone can read them.

## How it works
```
photo/PDF/text ─► Gemini (structured JSON: summary, actions, money, dates, warnings, scam signs, each with a quote)
              ─► core.js checker: does the quote exist in the document? is the amount/date inside the quote? is the date real?
              ─► cards with ✓ / ⚠ badges, countdowns, calendar file, read-aloud
```
- `core.js` holds the prompt, the JSON schema, the Gemini call, retries, the fact checker and the calendar file. It has no UI, so it is testable in Node.
- `app.js` holds the screens, file handling (photos are shrunk to 1600px before upload) and rendering. AI text is never inserted as HTML.
- `sample.js` holds the fictional sample and a hand-written example result.

## Failure handling
| Problem | What Samjho does |
|---|---|
| No API key | Opens Settings and explains |
| No internet | "Couldn't reach the AI service" |
| Wrong key | "Your API key was rejected" |
| Free quota busy (429) | Waits 8 s, retries once, then explains |
| Model retired (404) | Asks you to pick another model |
| AI returns broken JSON | Retries once, then shows an error |
| Blurry or dark photo | AI sets `readable:false`, so Samjho shows retake tips |
| Not a document (e.g. a selfie) | Says so instead of inventing content |
| AI invents or misreads a fact | Fact is marked **⚠ check** with the reason |
| Impossible date (e.g. 30 Feb) | Dropped or flagged |
| Huge PDF (>15 MB) or unsupported image | Clear message before upload |

## Limitations
- **Photos:** for photos, facts are checked against the AI's own transcription of the page, not against the paper. That catches internal inconsistencies but not misreads in the transcription itself. Pasted text is checked against the real text.
- Date checking understands English and Hindi/Marathi month names. Other scripts are checked by their numbers only.
- Read-aloud depends on which voices the phone has installed.
- My deadlines is stored in this browser only (localStorage). It doesn't sync between phones, and clearing browser data deletes it. Up to 30 letters are kept.
- Not legal or financial advice. Scam detection is a warning, not a guarantee.
- Documents are sent to Google's Gemini API. On the free tier, Google may use the data to improve its products, so users should cover ID numbers.

## AI disclosure
- **In the product:** Google Gemini (default `gemini-3.8-flash`, selectable) reads the image, PDF or text and returns structured JSON. Everything else (fact checking, dates, calendar) is ordinary code.
- **During development:** see [DEV_LOG.md](DEV_LOG.md).

## License
MIT. All test documents and organisations in this repo are fictional.
