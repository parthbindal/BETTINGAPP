import { db } from "@/lib/db";
import { trackUsage } from "@/lib/ops";

/**
 * Runs once after a user row is created: free plan, notification defaults,
 * email onboarding sequence, referral record and a welcome notification.
 */
export async function onUserCreated(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;
  await db.subscription.upsert({
    where: { userId },
    create: { userId, tier: "free", status: "active", source: "none" },
    update: {},
  });
  await db.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} });
  await db.emailSequenceState.upsert({
    where: { userId },
    create: { userId, step: 0, nextSendAt: new Date() },
    update: {},
  });
  if (user.referredById) {
    await db.referral.upsert({
      where: { referredUserId: userId },
      create: { referrerId: user.referredById, referredUserId: userId, status: "signed_up" },
      update: {},
    });
  }
  await db.notification.create({
    data: {
      userId,
      type: "system",
      title: "Welcome to EDGEWISE",
      body: "Start with the Overview, then take the first Academy lesson: What is a prediction market?",
      href: "/academy",
    },
  });
  trackUsage("signup", userId, { referred: Boolean(user.referredById) });
}
