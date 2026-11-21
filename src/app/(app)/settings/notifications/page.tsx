import { requireUser, getEntitlements } from "@/lib/session";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { Section } from "@/components/shared/page-header";
import { NotificationPrefsForm } from "@/components/settings/profile-forms";

export default async function NotificationSettingsPage() {
  const session = await requireUser("/settings/notifications");
  const [ent, prefs] = await Promise.all([getEntitlements(session.user.id), db.notificationPreference.findUnique({ where: { userId: session.user.id } })]);
  return (
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
  );
}
