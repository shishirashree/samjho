// A FICTIONAL sample document and a HAND-WRITTEN example result.
// Used only for "Try a sample" so people can preview the app without an API key.
// The app labels this clearly as an example, not a live AI answer.

export const SAMPLE_TEXT = `LAKEVIEW POWER SUPPLY CO.  (fictional sample)
NOTICE OF DISCONNECTION
Consumer No: 1100234567
Date: 18/11/2026

Dear Consumer,
Our records show that your electricity bill of Rs. 2,340.00 for the month of October 2026 remains unpaid. The due date was 05/11/2026.
Please pay the outstanding amount on or before 30/11/2026 to avoid disconnection of supply. A late payment surcharge of Rs. 50 will be added to your next bill.
If supply is disconnected, a reconnection fee of Rs. 150 will be charged.
You can pay at any Lakeview service centre or through the official Lakeview app. Lakeview staff will never ask for your OTP or bank PIN.
If you have already paid, please ignore this notice.

Assistant Engineer, Ward 7 Office`;

export const SAMPLE_RESULT = {
  is_document: true,
  readable: true,
  problem: "",
  doc_type: "Electricity disconnection notice",
  sender: "Lakeview Power Supply Co., Ward 7 Office",
  summary:
    "You have not paid your October electricity bill of Rs. 2,340. If you don't pay by 30 November 2026, your electricity can be cut. If you already paid, you can ignore this letter.",
  urgency: "high",
  source_text: SAMPLE_TEXT,
  actions: [
    { task: "Pay Rs. 2,340 for the October bill", deadline: "2026-11-30", quote: "Please pay the outstanding amount on or before 30/11/2026 to avoid disconnection of supply." },
    { task: "Pay only at a Lakeview service centre or the official Lakeview app", deadline: "", quote: "You can pay at any Lakeview service centre or through the official Lakeview app." },
  ],
  money: [
    { label: "Unpaid October bill", amount: "Rs. 2,340.00", quote: "your electricity bill of Rs. 2,340.00 for the month of October 2026 remains unpaid" },
    { label: "Late fee added to next bill", amount: "Rs. 50", quote: "A late payment surcharge of Rs. 50 will be added to your next bill." },
    { label: "Fee to reconnect if power is cut", amount: "Rs. 150", quote: "a reconnection fee of Rs. 150 will be charged" },
  ],
  dates: [
    { label: "Original due date (already passed)", date: "2026-11-05", quote: "The due date was 05/11/2026." },
    { label: "Last day to pay before power is cut", date: "2026-11-30", quote: "on or before 30/11/2026 to avoid disconnection" },
  ],
  warnings: [
    { text: "Your electricity can be disconnected if you miss the deadline.", quote: "to avoid disconnection of supply" },
    { text: "Never share your OTP or bank PIN — real staff will not ask for it.", quote: "Lakeview staff will never ask for your OTP or bank PIN." },
  ],
  scam_signals: [],
  unclear: ["The letter does not give a phone number to check if you already paid."],
};
