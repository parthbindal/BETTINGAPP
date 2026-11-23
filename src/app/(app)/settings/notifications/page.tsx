import { requireUser, getEntitlements } from "@/lib/session";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { DEFAULT_ALERT_PREFS } from "@/lib/smart-alerts-core";
import { channelUrl } from "@/lib/telegram";
import { Section } from "@/components/shared/page-header";
import { NotificationPrefsForm } from "@/components/settings/profile-forms";
import { SmartAlertsForm } from "@/components/settings/smart-alerts-form";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

const DAY_MS = 86_400_000;

/** [usd, rank] of every stored burst from the last day, once the alert engine has run for a full day; drives the live estimate. */
async function alertHistory(): Promise<Array<[number, number | null]> | null> {
  const oldest = await db.smartAlert.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  if (!oldest || oldest.createdAt.getTime() > Date.now() - DAY_MS) return null;
  const rows = await db.smartAlert.findMany({ where: { lastTradeAt: { gte: new Date(Date.now() - DAY_MS) } }, select: { usd: true, rank: true } });
  return rows.map((r) => [Math.round(r.usd), r.rank]);
}

export default async function NotificationSettingsPage() {
  const session = await requireUser("/settings/notifications");
  const [ent, prefs] = await Promise.all([getEntitlements(session.user.id), db.notificationPreference.findUnique({ where: { userId: session.user.id } })]);
  const pro = ent.limits.smartAlerts;
  const history = pro ? await alertHistory() : null;
  return (
    <div className="space-y-6">
      <Section title="Smart-money alerts" description="Big trades by Polymarket's most profitable traders. Each alert says what a trader did; none is advice to copy it.">
        <SmartAlertsForm
          pro={pro}
          channelUrl={channelUrl()}
          telegram={{ ready: config.isTelegramConfigured, linked: prefs?.telegramChatId ? { username: prefs.telegramUsername } : null }}
          initial={{
            smartAlerts: prefs?.smartAlerts ?? DEFAULT_ALERT_PREFS.smartAlerts,
            smartMinUsd: prefs?.smartMinUsd ?? DEFAULT_ALERT_PREFS.smartMinUsd,
            smartMaxRank: prefs?.smartMaxRank ?? DEFAULT_ALERT_PREFS.smartMaxRank,
            followAlerts: prefs?.followAlerts ?? DEFAULT_ALERT_PREFS.followAlerts,
          }}
          history={history}
        />
      </Section>
      <Section title="Notifications" description="Informative alerts about things you follow. Never countdowns or prompts to wager.">
        <NotificationPrefsForm
          custom={ent.limits.customNotifications}
          emailConfigured={config.isEmailConfigured}
          initial={{
            marketMoves: prefs?.marketMoves ?? true,
            moveThresholdPts: prefs?.moveThresholdPts ?? 5,
            projectionUpdates: prefs?.projectionUpdates ?? true,
            news: prefs?.news ?? false,
            upcomingEvents: prefs?.upcomingEvents ?? true,
            dataAvailability: prefs?.dataAvailability ?? true,
            emailDigest: prefs?.emailDigest ?? "weekly",
          }}
        />
      </Section>
    </div>
  );
}
