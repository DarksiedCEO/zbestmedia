import type {
  LeadConversion,
  LeadEvent,
  ScoreBreakdownItem,
  ScoreComputeInput,
  ScoreResult
} from "./types";

const FREE_EMAIL_DOMAINS = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com"]);

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function add(breakdown: ScoreBreakdownItem[], key: string, points: number, reason: string): void {
  breakdown.push({ key, points, reason });
}

function domainFromEmail(email?: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const d = email.slice(at + 1).trim().toLowerCase();
  return d.length > 0 ? d : null;
}

function withinDays(d: Date, now: Date, days: number): boolean {
  const ms = days * 24 * 60 * 60 * 1000;
  return now.getTime() - d.getTime() <= ms;
}

function getEventNumber(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function hasConversion(conversions: LeadConversion[], type: string): boolean {
  return conversions.some((c) => c.type === type);
}

function distinctDaysInWindow(events: LeadEvent[], now: Date, days: number): number {
  const set = new Set<string>();
  for (const e of events) {
    if (!withinDays(e.createdAt, now, days)) continue;
    const d = new Date(e.createdAt);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    set.add(key);
  }
  return set.size;
}

function newestConversionType(conversions: LeadConversion[]): string | null {
  if (conversions.length === 0) return null;
  let newest = conversions[0];
  for (const c of conversions) {
    if (c.createdAt.getTime() > newest.createdAt.getTime()) newest = c;
  }
  return newest.type;
}

function capOncePer24h(events: LeadEvent[], now: Date, type: string): boolean {
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  const recent = events
    .filter((e) => e.type === type && e.createdAt.getTime() >= cutoff)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return recent.length > 0;
}

export function computeScoreV1(input: ScoreComputeInput): ScoreResult {
  const breakdown: ScoreBreakdownItem[] = [];
  const { snapshot, events, conversions, now } = input;

  const recentEvents = events.filter((e) => withinDays(e.createdAt, now, 30));
  const recentConversions = conversions;

  add(breakdown, "base", 5, "Base score");
  let total = 5;

  switch (String(snapshot.source || "").toLowerCase()) {
    case "website":
      add(breakdown, "source.website", 10, "Inbound website lead");
      total += 10;
      break;
    case "referral":
      add(breakdown, "source.referral", 15, "Referral lead");
      total += 15;
      break;
    case "linkedin":
      add(breakdown, "source.linkedin", 8, "LinkedIn lead");
      total += 8;
      break;
    case "outbound":
      add(breakdown, "source.outbound", 3, "Outbound lead");
      total += 3;
      break;
    default:
      add(breakdown, "source.other", 0, "Unweighted/unknown source");
      break;
  }

  const emailDomain = domainFromEmail(snapshot.email);
  const companyDomain = snapshot.companyDomain?.trim().toLowerCase() || null;

  if (emailDomain && FREE_EMAIL_DOMAINS.has(emailDomain)) {
    add(breakdown, "email.free_domain", -5, `Free email domain (${emailDomain})`);
    total -= 5;
  } else if (emailDomain) {
    add(breakdown, "email.non_free_domain", 0, `Non-free email domain (${emailDomain})`);
  }

  if (companyDomain) {
    add(breakdown, "company.domain_present", 5, `Company domain provided (${companyDomain})`);
    total += 5;
  }

  if (capOncePer24h(recentEvents, now, "pricing_view")) {
    add(breakdown, "event.pricing_view", 20, "Viewed pricing (last 24h)");
    total += 20;
  }

  if (recentEvents.some((e) => e.type === "form_submit")) {
    add(breakdown, "event.form_submit", 25, "Submitted a form");
    total += 25;
  }

  if (recentEvents.some((e) => e.type === "demo_request")) {
    add(breakdown, "event.demo_request", 30, "Requested a demo");
    total += 30;
  }

  const pricingTimes = recentEvents
    .filter((e) => e.type === "pricing_time")
    .map((e) => getEventNumber(e.payload, "time_on_pricing_seconds"))
    .filter((n): n is number => typeof n === "number");

  const maxPricingTime = pricingTimes.length > 0 ? Math.max(...pricingTimes) : 0;
  if (maxPricingTime >= 120) {
    add(breakdown, "event.pricing_time_120", 15, "Spent >=120s on pricing");
    total += 15;
  } else if (maxPricingTime >= 60) {
    add(breakdown, "event.pricing_time_60", 10, "Spent >=60s on pricing");
    total += 10;
  } else if (maxPricingTime >= 30) {
    add(breakdown, "event.pricing_time_30", 5, "Spent >=30s on pricing");
    total += 5;
  }

  const days = distinctDaysInWindow(recentEvents, now, 7);
  if (days >= 2) {
    add(breakdown, "behavior.return_visit", 5, "Activity on >=2 distinct days in last 7d");
    total += 5;
  }

  let lifecycleStage: ScoreResult["lifecycleStage"] = undefined;

  const newestConv = newestConversionType(recentConversions);
  if (newestConv) {
    if (hasConversion(recentConversions, "signed_msa") || hasConversion(recentConversions, "purchase")) {
      lifecycleStage = "customer";
      add(breakdown, "conversion.customer", 100 - total, "Converted to customer");
      total = 100;
    } else if (hasConversion(recentConversions, "meeting_booked")) {
      lifecycleStage = "sql";
      if (total < 70) {
        add(breakdown, "conversion.meeting_booked_floor", 70 - total, "Meeting booked (min score 70)");
        total = 70;
      } else {
        add(breakdown, "conversion.meeting_booked", 0, "Meeting booked");
      }
    } else {
      add(breakdown, "conversion.present", 0, `Conversion present (${newestConv})`);
    }
  }

  const clamped = clamp(total, 0, 100);
  if (clamped !== total) {
    add(breakdown, "clamp", clamped - total, "Clamped score to [0, 100]");
    total = clamped;
  }

  return {
    version: "v1",
    scoreTotal: total,
    breakdown,
    lifecycleStage
  };
}
