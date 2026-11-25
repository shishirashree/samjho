import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAmounts, extractDates, mentionsScam } from "../eval/textfacts.mjs";

test("amounts in chat answers", () => {
  assert.deepEqual(extractAmounts("You owe ₹2,340.00, plus Rs. 50 late fee and 150 rupees to reconnect.").sort(), ["150", "2340", "50"]);
  assert.deepEqual(extractAmounts("कुल ₹४,२०० जमा करें"), ["4200"]);
  assert.deepEqual(extractAmounts("Pay before 30/11/2026"), []);
});

test("dates in chat answers", () => {
  const today = "2026-11-24";
  assert.deepEqual(extractDates("Pay by 30/11/2026. Meeting on Saturday, 12 December 2026.", today), ["2026-11-30", "2026-12-12"]);
  assert.deepEqual(extractDates("Due November 30, 2026 and the fee by Dec 10th", today), ["2026-11-30", "2026-12-10"]);
  assert.deepEqual(extractDates("31 दिसंबर 2026 तक", today), ["2026-12-31"]);
  assert.deepEqual(extractDates("visit by 15 January", today), ["2027-01-15"]);
  assert.deepEqual(extractDates("Pay as soon as possible, at the earliest", today), []);
});

test("scam mentions", () => {
  assert.equal(mentionsScam("This looks like a scam. Do not call that number."), true);
  assert.equal(mentionsScam("This is a normal bill."), false);
});

test("scam scorer counts only answers that call THIS message a scam (run 1 bug)", () => {
  assert.equal(mentionsScam("**WARNING: This message is a SCAM.**"), true);
  assert.equal(mentionsScam("⚠️ **THIS IS A SCAM! DO NOT RESPOND.**"), true);
  assert.equal(mentionsScam("यह मैसेज फर्जी है, इसका जवाब न दें।"), true);
  // general safety advice from the genuine bank letter (E5 run 2) is not a scam warning
  assert.equal(mentionsScam("इसलिए बैंक के नाम से आने वाले किसी भी फर्जी फोन या मैसेज पर अपनी गोपनीय जानकारी न दें।"), false);
  assert.equal(mentionsScam("The bank will never ask for your OTP. Beware of any fake calls."), false);
});
