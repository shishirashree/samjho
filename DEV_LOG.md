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
| 7 | *(you)* Real eval run with your key | Read `eval/results.md`, fill in the "Real error?" column | … | … |
| 8 | *(you)* Tested on a real letter at home (cover personal numbers) | Compared the app's answer with the paper | … | … |
| 9 | *(you)* UI change you made yourself | … | … | … |

## Work completed during the hackathon (Nov 21–28, 2026)
- New project, started Nov 24, 2026. No code existed before the event.
- Nov 24: first version (explain + fact checker + calendar + read aloud), 18 unit tests, AI evaluation set.
- Nov 25: "My deadlines" list across letters; plain-chatbot comparison in the evaluation; 26 unit tests; in-browser test runner (`eval.html`) so the evaluation runs on a phone.
- *(list your own changes each day, with the date)*
