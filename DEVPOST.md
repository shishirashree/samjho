## Who is Samjho for, and why would they use it?

**Users:** people in India who receive official letters, bills, school circulars and SMS notices in English or formal language they find hard to follow. Often that's an elderly parent, or someone who reads Hindi or Bengali more comfortably than English. Also the family members who usually get asked "what does this mean?".

**Situation:** a parent gets a printed notice: *"Please pay the outstanding amount on or before 30/11/2026 to avoid disconnection of supply. A late payment surcharge of Rs. 50…"*. They need to know three things fast: **what to do, by when, and how much**. Or they get an SMS saying their power will be cut *tonight* unless they call a number and share an OTP.

**Why it's a real need**
- Most Indians don't read English comfortably. The 2011 Census counted about 10.6% of Indians as English speakers ([Indian English, Wikipedia, citing Census 2011](https://en.wikipedia.org/wiki/Indian_English)). Yet bills and notices are often in English.
- Fake "unpaid electricity bill" messages are common. Delhi power companies reported a rising number of these scams, including a doctor who lost Rs 6 lakh after clicking a fake bill link ([ThePrint/PTI](https://theprint.in/india/electricity-bill-scam-delhi-discoms-urge-consumers-to-exercise-caution-follow-safety-tips/2167243)). SBI publicly warned about the exact "disconnected tonight at 9.30pm" WhatsApp message ([LatestLY](https://www.latestly.com/socially/india/news/electricity-bill-scam-alert-fraudsters-on-prowl-sbi-shares-safety-tips-to-counter-online-fraud-by-saying-yeh-wrong-number-hai-4298438.html/amp)). Our test case E3 is modelled on that message.

**Benefit over the current approach.** Today people ask a relative, or paste the letter into a chatbot. We compared Samjho with a plain chatbot (same AI model, ordinary question) on our 7 test letters ([results](https://github.com/shishirashree/samjho/tree/main/eval/history)):

| | Plain chatbot | Samjho |
|---|---|---|
| Key amounts and dates found | all | all |
| Wrong amounts or dates | 0 (25 answers) | 0 shown as ✓ |
| Scam SMS flagged | yes | yes |
| Words to read | ~170–190 | ~55–105 |
| Can you check each fact? | no | every fact links to the exact words in the letter |
| Claims not in the letter | yes ("KYC is completely free", "you may have to pay for the purifier service", "$0" for an Indian SMS) | no; only what the letter says |
| Deadlines kept for later | no | countdown, calendar reminder, **My deadlines** list |

**Honest result:** on clear typed letters the chatbot was just as accurate. Samjho's advantage is that you can **check** every fact, you read **about half as much or less**, it's in **your language with one tap**, and it **turns the letter into actions** (deadlines, reminders, read-aloud, share with family).

## What did I build during the hackathon?

**A new project, started 24 Nov 2026.** No code existed before the event. Everything in the repo was built during the hackathon ([commit history](https://github.com/shishirashree/samjho/commits/main), [dev log](https://github.com/shishirashree/samjho/blob/main/DEV_LOG.md)).

- **The app** (`index.html`, `app.js`, `core.js`): take a photo, upload a PDF, or paste text, and get a plain-language summary in 15 languages. You see what to do (with a deadline countdown), money, important dates, warnings, possible scam signs, and what the letter *doesn't* say clearly.
- **Fact checker** (`core.js`, plain code, not AI): checks every fact against the letter. Facts that match get **✓ in document**; the rest get **⚠ check**.
- **My deadlines:** remembers up to 30 letters on the device. It shows Overdue / This week / Later across all of them, with tick-to-done and "add all to calendar".
- **Action tools:** calendar file with a 1-day reminder, 🔊 read aloud, 📤 share to WhatsApp, and 💬 questions answered only from the letter.
- **Evaluation:** 7 fictional test letters with correct answers written by me, a plain-chatbot comparison, a command-line runner, and an in-browser runner ([eval.html](https://shishirashree.github.io/samjho/eval.html)) so the test runs on a phone.
- **38 offline unit tests** (`npm test`).

**Third-party, not my work:** Google Gemini API (the AI model), GitHub Pages (hosting), the browser's Web Speech API (read aloud). No frameworks or libraries.

## How did I use AI?

### AI in the finished project
- **Model and job:** Google Gemini (`gemini-3.8-flash` by default; my tests used `gemini-3.6-flash`) reads the photo, PDF or text. It returns a fixed **JSON schema**: summary, actions, money, dates, warnings, scam signals and unclear points, each with an exact **quote** from the letter.
- **Why this choice:** Gemini reads photos and PDFs directly, so no separate OCR step is needed. It can be forced to answer in a fixed JSON structure ([Gemini structured output docs](https://ai.google.dev/gemini-api/docs/structured-output)). It has a free tier, which matters for students and for users who won't pay for a letter explainer. I didn't benchmark other AI providers.
- **Project-specific decision: "show your proof".** The AI must quote the exact words behind every fact. Then **ordinary code** checks three things: the quote really appears in the letter, the amount or date is inside that quote, and the date is a real one. It also handles Indian digits (४२००) and Hindi month names (दिसंबर).
  - *Evidence it works:* on the scam SMS, the AI turned "tonight" into a specific calendar date. The checker marked it **⚠** instead of showing it as fact. When we fed it a deliberately wrong answer, it flagged all 9 wrong facts.
  - *Evidence we tuned it:* test run 1 had 2 false alarms (an action dated "on the day of the meeting"). After the fix, test runs 2 and 3 matched **82/82 facts with 0 false alarms**.
- **How I assessed quality (3 runs, 2 tries per letter, every letter covered):**
  - Run 1: 68/70 checks passed.
  - Runs 2 and 3, after fixes: 92/94 checks passed, 82/82 facts matched.
  - The only repeated miss: the AI rated a vague rent-rise message "high" urgency in 3 of 6 tries (I expected low or medium). With the test's date fixed to 24 Nov, "from next month" is only a week away, so "high" is arguable. I kept it as a failure rather than change the expected answer.
- **Limits this evidence shows:** the test letters are fictional and typed. Photos are where reading mistakes happen, and I tested only one real photo (a restaurant bill: amounts and date correct). For photos, the checker compares against the AI's own reading of the page, so it can't catch a misread of the paper itself. Urgency is a judgement and isn't always consistent.

### AI during development
- **Tool:** Claude (Anthropic) wrote most of the code, tests and docs under my direction. I ran every real test (live site, real API key, real photo) and decided what to keep.
- **Human checks and what they found** (full table in [DEV_LOG.md](https://github.com/shishirashree/samjho/blob/main/DEV_LOG.md)):
  - My first test run failed completely with **Google 503 (overloaded)** errors. → **Changed:** added retries and a backup model.
  - Run 1 showed **2 checker false alarms**. → **Changed:** a date can be confirmed by another line of the letter.
  - Run 2 reported **1 "wrong fact" by the chatbot**. Reading the answer showed it was *our scorer's* bug: it read "October." followed by "2." on the next line as "October 2". → **Changed**, and all 19 chatbot answers were re-scored.
  - My **real photo test** of a 2007 bill showed "passed 7116 days ago" and offered a calendar reminder. → **Changed:** old dates no longer get countdowns or reminders.
  - The test runs hit the **free daily limit**. → **Changed:** the app now detects this and switches to a backup model.
  - Run 3 said the chatbot **missed** the ₹14,000 rent. Reading its answer, it wrote "14,000" without ₹, just as the landlord did. → **Changed:** the scorer now credits it. Chatbot misses across all 25 answers: 0.
  - **Kept:** the AI-written fact checker, after its tests and both runs held up.

## How can people access and use Samjho, and what does it achieve?

- **Live app:** https://shishirashree.github.io/samjho/ (works on a phone)
- **Code:** https://github.com/shishirashree/samjho (setup in README)
- **Needs:** a browser, internet, and a free Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Paste it in ⚙️ Settings; it stays in your browser. Costs nothing on the free tier, which has daily limits. **Try a sample** works with no key.
- **Main task:** photo of a letter → **Explain this** → a correct summary in the chosen language, every action/amount/date with ✓ or ⚠, the deadline countdown, and the letter saved to My deadlines.

**Test results** (`gemini-3.6-flash`, fictional letters, 3 runs × 2 tries; [full reports](https://github.com/shishirashree/samjho/tree/main/eval/history)):

| Case | What should happen | What happened |
|---|---|---|
| E1 Electricity disconnection notice (ordinary) | Find Rs 2,340 / 50 / 150 and 30 Nov; no scam flag | ✅ All found, all ✓, in every run |
| E2 School circular (ordinary) | Find ₹8,500 / ₹200, 10 Dec and 12 Dec | ✅ All found; after the fix, 0 false alarms |
| Repeat check | Same answer each time | ✅ E1, E2, E4, E5 and E7 gave identical amounts and dates every time |
| E3 Scam SMS (demanding, modelled on the real SBI-warned message) | Flag as scam; invent no dates | ✅ Flagged as scam in 4/4 runs. One run invented a date, which the checker marked ⚠ |
| E4 Hindi tax notice explained in English (demanding) | ₹4,200 and 31 Dec from Hindi text | ✅ Found and verified in all runs |
| E5 Bank letter explained in Hindi | Hindi summary, 15 Jan 2027 | ✅ 5/5 completed tries (1 try lost to a network error) |
| E6 Vague landlord message | ₹14,000; no invented date; say what's unclear | ✅ No invented date in 6/6. ❌ Urgency was "high" in 3 of 6 (expected low or medium) |
| E7 Random chat (not a document) | Invent nothing | ✅ 3/3 completed tries: no actions, money or dates |

**Design choices that cut user effort:**
- One screen, three big inputs (camera, upload, paste). The language is remembered.
- Photos are shrunk before upload so they work on slow mobile data.
- "What to do" comes first, with a countdown.
- One tap for calendar, read-aloud or WhatsApp share, and nothing to retype.
- AI text is never inserted as HTML, for safety.

## What are the current limitations, and what happens when something goes wrong?

**Limitations**
- Only one real photo tested so far; test letters are fictional and typed.
- Photo checking uses the AI's own reading of the page (see above).
- Date checking understands English and Hindi/Marathi month names; other scripts are checked by their numbers.
- Read-aloud depends on the voices installed on the phone.
- My deadlines lives only in this browser and doesn't sync.
- The free tier allows a limited number of requests per day per model.
- Scam detection is a warning, not a guarantee. Not legal or financial advice.
- Letters are sent to Google's Gemini API; users should cover ID numbers.
- **Clearly labelled:** "Try a sample" shows a *hand-written example* for a fictional notice, without calling the AI.

**Failure handling** (each tested in code with simulated responses; the first five also happened for real):

| Problem | Detected by | What Samjho does |
|---|---|---|
| Google overloaded (503), **seen in my first run** | HTTP status | Retries after 4 s and 10 s, then switches to a backup model and tells the user |
| Free daily limit used up, **seen in my runs** | Google's quota details | Doesn't retry pointlessly; switches model or says when it resets |
| Per-minute limit (429) | HTTP status and Google's retry delay | Waits as long as Google asks |
| AI states a fact the letter doesn't support, **seen on the scam SMS** | Quote / value checker | Marks it ⚠ with the reason |
| Old dates (2007 bill), **seen in my photo test** | Date logic | No countdown or calendar reminder |
| No internet, wrong key, retired model, broken JSON | Error type | Clear message, or one retry for garbled output |
| Blurry photo / not a document | AI returns `readable` / `is_document` = false | Retake tips instead of invented content |
| Huge PDF, unsupported image, storage full | Before upload / on save | Clear message, nothing lost |
