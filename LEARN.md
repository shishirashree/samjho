# Learn how Samjho works (plain-English guide)

Read this once and you'll be able to explain every part of the project to a judge, or change it yourself.

## 1. The big idea in one picture
```
 You  ──photo──►  Gemini AI  ──JSON──►  Our checker  ──►  Cards on screen
                 (reads & explains)     (catches lies)
```
The AI is smart but sometimes **makes things up**. People call this *hallucination*. Samjho's trick is that it **doesn't trust the AI blindly**. For every fact, the AI must also hand over the exact words from the letter, like a student showing their working. Our own code (not AI) then checks those words.

## 2. The files
| File | Think of it as… | What's inside |
|---|---|---|
| `index.html` | The body | Layout and colours (CSS) |
| `app.js` | The hands | What happens when you tap a button |
| `core.js` | The brain | Talking to the AI and checking its answers |
| `sample.js` | The practice paper | A fictional letter and a hand-made answer |
| `tests/` | The exam | Automatic checks that the brain works |
| `eval/` | The report card | Measures how good the AI really is |

## 3. Key concepts (you'll be asked about these)

**API & API key.** An API is a door that lets your program talk to someone else's program. Google's Gemini API is the door to their AI. The **key** is like a library card: it says who's asking. Never put it on GitHub. That's why Samjho asks for it in Settings and keeps it in the browser (`localStorage`).

**Prompt.** The instructions we send the AI. See `buildPrompt()` in `core.js`. Notice rule 1: *"Only state facts that are written in the document."*

**Structured output / JSON schema.** Instead of letting the AI write a paragraph, we give it a form to fill in (`RESPONSE_SCHEMA`). JSON is just labelled data, like `{"amount": "Rs. 2,340"}`. Because the answer is a form, we can draw tidy cards and check each box.

**Multimodal.** The AI can read pictures, not just text. We send the photo as `inline_data` (the image turned into text using *base64*).

**Fact checking (grounding).** `quoteStatus()` checks: *do the quoted words really appear in the letter?* `amountMatchesQuote()` and `dateMatchesQuote()` check: *is the number the AI gave actually inside those words?* If the AI says "Rs. 3,240" but the quote says "Rs. 2,340", it gets **⚠ check**.

**Temperature.** How "creative" the AI is (0 = careful, 1 = random). We use 0.1, because we want facts, not poetry.

**Retry.** Networks and AIs fail sometimes. `explainDocument()` tries once more when the AI's answer is garbled or the free quota is busy.

**.ics file.** The universal calendar file format. Every phone calendar can open one. `buildIcs()` writes it by hand. It's just text!

**Unit test vs evaluation.**
- *Unit tests* (`npm test`) check **our code** with fake AI answers. They're fast, free, and give the same result every time.
- *Evaluation* (`npm run eval`) checks **the real AI** on test letters where *we* know the right answer. It gives a score.

## 4. Try these small changes to learn
1. Add a language: in `core.js`, add `{ name: "Nepali", speech: "ne-NP" }` to `LANGUAGES`.
2. Change the colour: in `index.html`, edit `--brand: #1f5f4a;`.
3. Make a test fail on purpose: in `tests/core.test.mjs`, change `"verified"` to `"partial"` in the first test, run `npm test`, and watch it go red. Then change it back.
4. Add your own test letter to `eval/fixtures.json` (keep it fictional) and run the eval.

## 5. Words judges like (and what they mean here)
- **Hallucination mitigation** → our quote checker
- **Structured output** → the JSON schema
- **Human-in-the-loop** → ⚠ items ask the human to check
- **Graceful degradation** → clear messages when things fail
- **Evaluation set** → `eval/fixtures.json`
