import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { PLANS } from "@/lib/subscriptions/plans";

export const REFERRAL_TERMS = `When someone signs up with your link and later subscribes to a paid plan, you receive one month of Pro ($${PLANS.pro.priceMonthly}) once: as account credit on your next invoice if you already subscribe, or as a complimentary month if you are on Free. No reward is paid for sign-ups alone, and self-referrals do not qualify.`;

export async function getReferralSummary(userId: string) {
  const [user, referrals] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { referralCode: true } }),
    db.referral.findMany({ where: { referrerId: userId }, orderBy: { createdAt: "desc" } }),
  ]);
  const code = user?.referralCode ?? null;
  return {
    code,
    link: code ? `${config.appUrl}/sign-up?ref=${code}` : null,
    signedUp: referrals.length,
    converted: referrals.filter((r) => r.status === "converted" || r.status === "rewarded").length,
    rewarded: referrals.filter((r) => r.status === "rewarded").length,
  };
}
