import { config } from "@/lib/env";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/subscriptions/plans";
import { getLatestBrief, generateBrief } from "@/lib/briefs";

interface Template {
  subject: string;
  text: (name: string) => string;
}

/** Six-step onboarding sequence. Day offsets are relative to sign-up. */
export const ONBOARDING_SEQUENCE: Array<{ step: number; dayOffset: number; template: string }> = [
  { step: 1, dayOffset: 0, template: "welcome" },
  { step: 2, dayOffset: 1, template: "platform-intro" },
  { step: 3, dayOffset: 3, template: "first-lesson" },
  { step: 4, dayOffset: 5, template: "first-report" },
  { step: 5, dayOffset: 8, template: "pro-features" },
  { step: 6, dayOffset: 11, template: "upgrade-invite" },
];

const url = (p: string) => `${config.appUrl}${p}`;
const FOOTER = `\n\n—\nEDGEWISE is educational and does not place wagers or give financial advice. Manage email preferences: ${config.appUrl}/settings/notifications`;

export const TEMPLATES: Record<string, Template> = {
  welcome: {
    subject: "Welcome to EDGEWISE",
    text: (name) => `Hi ${name},

Welcome to EDGEWISE: Understand the Numbers. Find the Edge.

EDGEWISE is an educational and analytical platform. We do not place wagers or promise returns. We help you understand what market prices, probabilities and statistics actually mean.

Start here: ${url("/overview")}

If you ever need help with gambling, call or text 1-800-GAMBLER.`,
  },
  "platform-intro": {
    subject: "A two-minute tour of EDGEWISE",
    text: (name) => `Hi ${name},

Three places to start:
1. Market Intelligence: live Kalshi markets with implied probability, spread, liquidity and a transparent model estimate. ${url("/markets")}
2. AI Analyst: ask plain-English questions; it retrieves data and cites sources. ${url("/analyst")}
3. Learning Academy: short lessons from beginner to advanced. ${url("/academy")}

Every number shows where it came from and how fresh it is.`,
  },
  "first-lesson": {
    subject: "Lesson 1: What is implied probability?",
    text: (name) => `Hi ${name},

A 62¢ contract implies a 62% probability. But the price includes fees, spread and liquidity effects, so "implied" is not "true".

Take the 8-minute lesson, with an interactive converter: ${url("/academy/prediction-markets-101/implied-probability")}`,
  },
  "first-report": {
    subject: "Generate your first research report",
    text: (name) => `Hi ${name},

Pick any market and click "Generate report". You get an executive summary, probability analysis, counterarguments, risk factors and a data-quality rating, with sources.

Try it: ${url("/research/new")}`,
  },
  "pro-features": {
    subject: "What Pro adds",
    text: (name) => `Hi ${name},

Pro ($${PLANS.pro.priceMonthly}/month) adds 90 days of history, the Opportunity Scanner, full sports analytics with matchup reports, 50 AI queries a day, a 50-item watchlist with alerts, and the full Academy.

Compare plans: ${url("/pricing")}

The Free plan stays genuinely useful. Upgrade only if you want more depth.`,
  },
  "upgrade-invite": {
    subject: "Ready to go deeper?",
    text: (name) => `Hi ${name},

If EDGEWISE has been useful, Pro unlocks the full platform: 2 years of history, the scanner, Price Lab, Whale Watch, full sports analytics and 150 AI queries a day. Cancel any time from Settings.

${url("/pricing")}

Either way, thanks for learning with us.`,
  },
};

/** Send via Resend if configured; otherwise record a skipped log so nothing is silently lost. */
async function deliver(opts: { userId?: string; to: string; template: string; subject: string; text: string }) {
  const body = opts.text + FOOTER;
  if (!config.isEmailConfigured) {
    await db.emailLog.create({ data: { userId: opts.userId, to: opts.to, template: opts.template, subject: opts.subject, status: "skipped_no_provider" } });
    return { sent: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.emailFrom, to: [opts.to], subject: opts.subject, text: body }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    await db.emailLog.create({ data: { userId: opts.userId, to: opts.to, template: opts.template, subject: opts.subject, status: "sent" } });
    return { sent: true };
  } catch (e) {
    await db.emailLog.create({ data: { userId: opts.userId, to: opts.to, template: opts.template, subject: opts.subject, status: "failed", error: e instanceof Error ? e.message : String(e) } });
    return { sent: false };
  }
}

export async function sendEmail(opts: { userId?: string; to: string; template: string; name: string }) {
  const t = TEMPLATES[opts.template];
  if (!t) throw new Error(`Unknown template ${opts.template}`);
  return deliver({ userId: opts.userId, to: opts.to, template: opts.template, subject: t.subject, text: t.text(opts.name || "there") });
}

/** Advance due onboarding sequences. Called by the jobs endpoint. */
export async function runOnboardingSequence(limit = 100) {
  const due = await db.emailSequenceState.findMany({ where: { completed: false, nextSendAt: { lte: new Date() } }, include: { user: true }, take: limit });
  let sent = 0;
  for (const s of due) {
    const next = ONBOARDING_SEQUENCE.find((x) => x.step === s.step + 1);
    if (!next) {
      await db.emailSequenceState.update({ where: { userId: s.userId }, data: { completed: true } });
      continue;
    }
    const r = await sendEmail({ userId: s.userId, to: s.user.email, template: next.template, name: s.user.name });
    const after = ONBOARDING_SEQUENCE.find((x) => x.step === next.step + 1);
    await db.emailSequenceState.update({
      where: { userId: s.userId },
      data: {
        step: next.step,
        lastSentAt: new Date(),
        nextSendAt: after ? new Date(s.user.createdAt.getTime() + after.dayOffset * 86400_000) : null,
        completed: !after,
      },
    });
    if (r.sent) sent++;
  }
  return { due: due.length, sent, emailConfigured: config.isEmailConfigured };
}

/** Daily or weekly research digest for users who opted in. Informational only. */
export async function sendDigestEmails(kind: "daily" | "weekly", limit = 500) {
  const brief = (await getLatestBrief(kind))?.content ?? (await generateBrief(kind));
  const prefs = await db.notificationPreference.findMany({ where: { emailDigest: kind }, include: { user: true }, take: limit });
  const pct = (p: number | null) => (p === null ? "n/a" : `${Math.round(p * 100)}%`);
  const lines = [
    `${kind === "daily" ? "Today" : "This week"} in the markets: ${brief.headline}.`,
    "",
    "Biggest moves",
    ...brief.movers.slice(0, 5).map((m) => `- ${m.title}${m.yesSubTitle ? ` (${m.yesSubTitle})` : ""}: ${pct(m.from)} → ${pct(m.to)}  ${url(`/markets/${m.ticker}`)}`),
    "",
    "Closing soon",
    ...brief.closingSoon.slice(0, 5).map((m) => `- ${m.title}${m.yesSubTitle ? ` (${m.yesSubTitle})` : ""}: ${pct(m.prob)}  ${url(`/markets/${m.ticker}`)}`),
    "",
    "A large move is a prompt to find the news behind it, not a signal to act.",
    `Full summary: ${url("/research")}`,
  ];
  let sent = 0;
  for (const p of prefs) {
    const r = await deliver({ userId: p.userId, to: p.user.email, template: `${kind}-digest`, subject: `EDGEWISE ${kind} research summary`, text: `Hi ${p.user.name || "there"},\n\n${lines.join("\n")}` });
    if (r.sent) sent++;
  }
  return { recipients: prefs.length, sent, emailConfigured: config.isEmailConfigured };
}
