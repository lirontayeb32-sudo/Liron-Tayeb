import { describe, expect, it } from "vitest";
import { dailyPriorityList, scoreLead, type ScoreInput } from "@/lib/scoring";

const NOW = new Date("2026-11-16T08:00:00Z"); // Monday morning in Israel
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function lead(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    stage: "FOLLOW_UP",
    depart_date: null,
    follow_up_date: null,
    consent: "unknown",
    do_not_contact: false,
    booking_intent: false,
    payment_question: false,
    waiting_for_our_reply: false,
    waiting_for_quote_update: false,
    quote_sent_at: null,
    last_customer_reply_at: null,
    last_contacted_at: daysAgo(10),
    created_at: daysAgo(20),
    ...over,
  };
}

describe("scoreLead", () => {
  it("always stays within 0–100 and explains every point", () => {
    const hot = scoreLead(
      lead({
        stage: "READY_TO_BOOK",
        waiting_for_our_reply: true,
        waiting_for_quote_update: true,
        booking_intent: true,
        payment_question: true,
        depart_date: "2026-11-25",
        follow_up_date: "2026-11-10",
        last_customer_reply_at: daysAgo(0),
      }),
      NOW,
    );
    expect(hot.score).toBe(100);
    expect(hot.factors.length).toBeGreaterThan(5);
    for (const f of hot.factors) {
      expect(f.explanation.length).toBeGreaterThan(5);
      expect(f.points).not.toBe(0);
    }
    const cold = scoreLead(lead({ depart_date: "2026-01-01", last_customer_reply_at: daysAgo(90) }), NOW);
    expect(cold.score).toBe(0);
    expect(cold.factors.some((f) => f.key === "travel_date" && f.points < 0)).toBe(true);
  });

  it("score equals the clamped sum of its factors (transparent)", () => {
    const s = scoreLead(lead({ stage: "QUOTED", payment_question: true, depart_date: "2026-12-10" }), NOW);
    const sum = s.factors.reduce((a, f) => a + f.points, 0);
    expect(s.score).toBe(Math.max(0, Math.min(100, sum)));
    expect(s.score).toBe(12 + 8 + 12);
  });

  it("ranks a customer waiting for our answer above an idle one", () => {
    const waiting = scoreLead(lead({ waiting_for_our_reply: true }), NOW);
    const idle = scoreLead(lead(), NOW);
    expect(waiting.score).toBeGreaterThan(idle.score);
    expect(waiting.summary).toContain("מחכה לתשובה");
  });

  it("travel date proximity raises priority; closer is higher", () => {
    const soon = scoreLead(lead({ depart_date: "2026-11-25" }), NOW).score;
    const later = scoreLead(lead({ depart_date: "2027-01-10" }), NOW).score;
    const far = scoreLead(lead({ depart_date: "2027-09-01" }), NOW).score;
    expect(soon).toBeGreaterThan(later);
    expect(later).toBeGreaterThan(far);
  });

  it("flags a quote with no reply, but not once the customer answered", () => {
    const silent = scoreLead(lead({ stage: "QUOTED", quote_sent_at: daysAgo(3) }), NOW);
    expect(silent.factors.some((f) => f.key === "quote_silence")).toBe(true);
    const answered = scoreLead(
      lead({ stage: "QUOTED", quote_sent_at: daysAgo(3), last_customer_reply_at: daysAgo(1) }),
      NOW,
    );
    expect(answered.factors.some((f) => f.key === "quote_silence")).toBe(false);
  });

  it("due and overdue follow-ups add points; future ones do not", () => {
    expect(scoreLead(lead({ follow_up_date: "2026-11-16" }), NOW).factors.some((f) => f.key === "follow_up")).toBe(true);
    expect(scoreLead(lead({ follow_up_date: "2026-11-01" }), NOW).factors.some((f) => f.key === "follow_up")).toBe(true);
    expect(scoreLead(lead({ follow_up_date: "2026-11-30" }), NOW).factors.some((f) => f.key === "follow_up")).toBe(false);
  });

  it("pushes down leads already contacted today unless the customer replied since", () => {
    const base = { waiting_for_quote_update: true, last_contacted_at: new Date(NOW.getTime() - 3_600_000) };
    const contacted = scoreLead(lead(base), NOW);
    expect(contacted.factors.some((f) => f.key === "contacted_today")).toBe(true);
    const replied = scoreLead(lead({ ...base, last_customer_reply_at: new Date(NOW.getTime() - 60_000) }), NOW);
    expect(replied.factors.some((f) => f.key === "contacted_today")).toBe(false);
  });

  it("never makes closed or do-not-contact leads actionable", () => {
    for (const over of [
      { stage: "WON" as const },
      { stage: "LOST" as const },
      { do_not_contact: true, waiting_for_our_reply: true },
      { consent: "denied" as const, booking_intent: true },
    ]) {
      const s = scoreLead(lead(over), NOW);
      expect(s.actionable).toBe(false);
      expect(s.score).toBe(0);
      expect(s.blockedReason).toBeTruthy();
    }
  });
});

describe("dailyPriorityList", () => {
  it("returns at most 20 actionable leads sorted by score, excluding opt-outs", () => {
    const leads = [
      ...Array.from({ length: 30 }, (_, i) =>
        lead({ depart_date: addDaysIso(10 + i * 5), created_at: daysAgo(i) }),
      ),
      lead({ waiting_for_our_reply: true, booking_intent: true }),
      lead({ do_not_contact: true, waiting_for_our_reply: true, booking_intent: true }),
      lead({ stage: "WON" }),
    ];
    const list = dailyPriorityList(leads, NOW);
    expect(list).toHaveLength(20);
    expect(list[0].lead.booking_intent).toBe(true);
    expect(list.every((x) => !x.lead.do_not_contact && x.lead.stage !== "WON")).toBe(true);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].score.score).toBeGreaterThanOrEqual(list[i].score.score);
    }
  });
});

function addDaysIso(n: number): string {
  return new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}
