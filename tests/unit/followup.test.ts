import { describe, expect, it } from "vitest";
import {
  ContactBlockedError,
  generateFollowup,
  pickScenario,
  type FollowupLead,
  type Scenario,
} from "@/lib/followup";
import { blockingIssues, checkMessage } from "@/lib/guardrails";

const NOW = new Date("2026-11-16T08:00:00Z"); // Monday
const ctx = { agencyName: "תכלת תיירות", agentName: "נועה", now: NOW };

function lead(over: Partial<FollowupLead> = {}): FollowupLead {
  return {
    full_name: "דנה בדיקה",
    destination: "רומא",
    depart_date: "2027-02-10",
    return_date: "2027-02-15",
    passengers: 2,
    budget_amount: "8000",
    stage: "FOLLOW_UP",
    consent: "unknown",
    do_not_contact: false,
    booking_intent: false,
    payment_question: false,
    waiting_for_our_reply: false,
    waiting_for_quote_update: false,
    quote_sent_at: null,
    last_customer_reply_at: null,
    last_contacted_at: null,
    ...over,
  };
}

const SCENARIO_LEADS: Record<Scenario, Partial<FollowupLead>> = {
  waiting_reply: { waiting_for_our_reply: true },
  waiting_quote: { waiting_for_quote_update: true },
  ready_to_book: { stage: "READY_TO_BOOK" },
  payment: { payment_question: true },
  quoted_no_reply: { stage: "QUOTED", quote_sent_at: new Date("2026-11-12T08:00:00Z") },
  new_inquiry: { stage: "NEW" },
  qualifying: { stage: "QUALIFYING" },
  check_in: {},
};

describe("generateFollowup", () => {
  it("picks the scenario from the lead state", () => {
    for (const [scenario, over] of Object.entries(SCENARIO_LEADS)) {
      expect(pickScenario(lead(over))).toBe(scenario);
    }
  });

  it("every scenario and variant is short, personal and passes the guardrails", () => {
    for (const [scenario, over] of Object.entries(SCENARIO_LEADS)) {
      for (const destination of ["רומא", null]) {
        for (const variant of [0, 1]) {
          const s = generateFollowup(lead({ ...over, destination }), { ...ctx, variant });
          const label = `${scenario}/${destination}/${variant}`;
          expect(s.message, label).toContain("דנה");
          expect(s.message, label).toContain("תכלת תיירות");
          expect(s.message.length, label).toBeLessThan(320);
          expect(checkMessage(s.message), label).toEqual([]);
          expect(s.message, label).not.toMatch(/\d/); // no numbers at all → no prices, no dates
          expect(s.message, label).not.toMatch(/undefined|null/);
          expect(s.suggestedAction.length, label).toBeGreaterThan(5);
          expect(s.reason.length, label).toBeGreaterThan(10);
          expect(s.nextFollowUp, label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    }
  });

  it("asks for exactly the missing details on a new inquiry", () => {
    const s = generateFollowup(
      lead({ stage: "NEW", destination: null, depart_date: null, passengers: null, budget_amount: null }),
      ctx,
    );
    expect(s.message).toContain("לאן");
    expect(s.message).toContain("תאריכים");
    expect(s.message).toContain("נוסעים");
    const complete = generateFollowup(lead({ stage: "NEW" }), ctx);
    expect(complete.message).not.toContain("כמה נוסעים");
  });

  it("refuses to draft for opted-out or closed leads", () => {
    expect(() => generateFollowup(lead({ do_not_contact: true }), ctx)).toThrow(ContactBlockedError);
    expect(() => generateFollowup(lead({ consent: "denied" }), ctx)).toThrow(ContactBlockedError);
    expect(() => generateFollowup(lead({ stage: "WON" }), ctx)).toThrow(ContactBlockedError);
    expect(() => generateFollowup(lead({ stage: "LOST" }), ctx)).toThrow(ContactBlockedError);
  });

  it("schedules the next follow-up on a business day and never after departure", () => {
    // Thursday + 2 days = Saturday → Sunday
    const thursday = new Date("2026-11-19T08:00:00Z");
    const quoted = generateFollowup(lead({ stage: "QUOTED" }), { ...ctx, now: thursday });
    expect(quoted.nextFollowUp).toBe("2026-11-22");
    const waiting = generateFollowup(lead({ waiting_for_our_reply: true }), ctx);
    expect(waiting.nextFollowUp).toBe("2026-11-16");
    const leavingSoon = generateFollowup(lead({ depart_date: "2026-11-18" }), ctx);
    expect(leavingSoon.nextFollowUp).toBe("2026-11-18");
  });

  it("falls back to a neutral message when lead data would smuggle in a forbidden claim", () => {
    const s = generateFollowup(lead({ stage: "QUOTED", destination: "פראג במבצע 50% הנחה" }), ctx);
    expect(blockingIssues(s.message)).toEqual([]);
    expect(s.message).not.toContain("הנחה");
  });
});

describe("guardrails", () => {
  it("flags prices, discounts, false urgency and availability claims", () => {
    const cases: Array<[string, string]> = [
      ["ההצעה יוצאת 4,500 ₪ לזוג", "price"],
      ["המחיר 1200 דולר לאדם", "price"],
      ["יש לי בשבילך הנחה מיוחדת", "discount"],
      ["מבצע עד סוף השבוע", "discount"],
      ["10% על כל החבילה", "discount"],
      ["נשארו רק שני מקומות אחרונים", "urgency"],
      ["המחיר יעלה מחר", "urgency"],
      ["יש עדיין מקומות בטיסה של יום שני", "availability"],
      ["שמרתי לך שני מושבים", "availability"],
    ];
    for (const [text, rule] of cases) {
      expect(checkMessage(text).map((i) => i.rule), text).toContain(rule);
    }
  });

  it("passes ordinary warm messages", () => {
    expect(checkMessage("היי דנה, רציתי לבדוק שההצעה לרומא הגיעה אליך. אני כאן לכל שאלה 🙂")).toEqual([]);
    expect(checkMessage("")).toEqual([{ rule: "empty", message: "ההודעה ריקה" }]);
  });
});
