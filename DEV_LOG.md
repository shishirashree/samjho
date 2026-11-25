# Development log & AI-assisted development disclosure

The rubric rewards showing **how a person checked AI-written work**: what you checked, what you found, and whether you kept, changed or rejected it. Fill in the blanks honestly as you go. Judges want real checks, not perfect ones.

## Tools used during development
- **Claude (Anthropic):** drafted the first version of `core.js`, `app.js`, `index.html`, the unit tests, the evaluation script and these docs (Nov 24, 2026).
- *(add anything else you use: VS Code, ChatGPT, Copilot…)*

## Checks of AI-written work

| # | What the AI produced | How a person checked it | What the check found | Kept / changed / rejected |
|---|---|---|---|---|
| 1 | Date checker (`dateMatchesQuote`) | Review while writing Hindi test cases (`31 दिसंबर 2026`, Devanagari digits `३१`) | First draft only understood English month names and 0-9 digits, so Hindi notices would have been wrongly flagged | **Changed:** added Hindi/Marathi month names and Indian-digit conversion; tests now pass |
| 2 | Fact checker on pasted text | Test where a fake AI answer lies in its own `source_text` | Needed to confirm pasted text is checked against the *real* text, not the AI's copy | **Kept:** test "pasted text is verified against the real text" passes |
| 3 | Evaluation script | Dry run with a fake AI that gives the wrong letter's answer | Fact checker flagged all 9 wrong facts on the scam SMS case | **Kept** |
| 4 | "My deadlines" list screen | Opened the page on a phone-size screen with 2 saved letters and looked at it | The grouped lists showed as raw text (`[object HTMLHeadingElement]`). The code appended JavaScript arrays where the browser expects elements. | **Changed:** flattened the list before adding it; re-checked the screen and ticking an item |
| 5 | Saving dates to the list | Looked at the list after saving the sample letter | The letter's *old* due date (already passed when scanned) showed as "Overdue", which is noise | **Changed:** dates already past at scan time are not saved as to-dos; test updated |
| 6 | Chatbot comparison scorer (`eval/textfacts.mjs`) | Unit tests with sample chat answers in English and Hindi | Works on common date and money formats. It counts a correct total the chatbot added up (e.g. ₹2,390) as "not in the letter" | **Kept**, with a note in the report telling readers to check those cases by hand |
| 7 | Error handling for an unavailable AI service | First real evaluation run on the live site (Nov 25, by shishirashree) | Google returned **503 (overloaded)** on the first 5 calls. The app only retried on 429 and gave up after one try, so every call failed | **Changed:** 500/502/503/504 are now treated as temporary. Retries wait 4 s then 10 s, then the app falls back to a backup model and says so. 4 new tests. The evaluation itself never switches models, so its scores stay honest |
| 8 | Full AI evaluation, run 1 (`eval/history/2026-11-25-run1-gemini-3.6-flash.md`) | shishirashree ran the test page on the live site (gemini-3.6-flash, 2 runs per letter) and read the report with Claude | 68/70 checks passed. **E2:** 2 correct items ("bring report card on the day of the meeting" = 12 Dec) were flagged ⚠, because their quote doesn't contain the date. That's a false alarm. **E3:** the AI turned "tonight" into a calendar date; the checker flagged it correctly. **E5:** the scorer counted the chatbot's general advice "beware of *any* fake call" as a scam warning. **E6/E7:** some calls failed on the free tier's per-minute limit. **E6:** the AI rated a rent rise "high" urgency | **Changed:** a date is accepted if another verified line of the letter proves it (fixes E2 without hiding E3). **Changed:** the scam scorer only counts answers that call *this* message a scam; re-scored run 1, and all 10 chatbot answers are now classified correctly. **Changed:** rate limits now wait as long as Google asks (or 20 s/40 s), and the test is paced at 9 s per call. **Kept:** E6 urgency stays a recorded failure; it's a judgment call, not a bug. 4 new tests (34 total) |
| 9 | Plain-chatbot comparison, run 1 | Read all 10 chatbot answers in full | On these clear, typed letters, the plain chatbot made **no wrong amounts or dates** and caught the scam. That disproved our guess that it would invent numbers. Its answers were twice as long (190 vs 94 words). It added claims not in the letter ("KYC is completely free", example ID documents) and said "$0" for an Indian SMS | **Changed the pitch:** Samjho's claim is now *checkable and shorter*, plus deadlines and actions, not "the chatbot is wrong" |
| 10 | *(you)* Tested on a real letter at home (cover personal numbers) | Compared the app's answer with the paper | … | … |
| 11 | *(you)* UI change you made yourself | … | … | … |

## Work completed during the hackathon (Nov 21–28, 2026)
- New project, started Nov 24, 2026. No code existed before the event.
- Nov 24: first version (explain + fact checker + calendar + read aloud), 18 unit tests, AI evaluation set.
- Nov 25: "My deadlines" list across letters; plain-chatbot comparison in the evaluation; 26 unit tests; in-browser test runner (`eval.html`) so the evaluation runs on a phone; retry + backup model after real 503 errors; fixes from evaluation run 1 (date false alarm, scam scorer, rate-limit pacing).
- *(list your own changes each day, with the date)*
