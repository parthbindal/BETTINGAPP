import { randomInt } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { onUserCreated } from "@/lib/onboarding";
import { cancelStripeSubscriptionForUser } from "@/lib/stripe";

export const MIN_AGE_YEARS = 18;

function yearsBetween(a: Date, b: Date): number {
  let years = b.getFullYear() - a.getFullYear();
  const m = b.getMonth() - a.getMonth();
  if (m < 0 || (m === 0 && b.getDate() < a.getDate())) years--;
  return years;
}

function makeReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

export const auth = betterAuth({
  appName: "EDGEWISE",
  baseURL: config.appUrl,
  secret: config.authSecret,
  database: prismaAdapter(db, { provider: config.isPostgres ? "postgresql" : "sqlite" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      dateOfBirth: { type: "date", required: false, input: true },
      region: { type: "string", required: false, input: true },
      experienceLevel: { type: "string", required: false, input: true },
      referredById: { type: "string", required: false, input: true },
      acceptedTermsAt: { type: "date", required: false, input: false },
      responsibleUseAckAt: { type: "date", required: false, input: false },
      referralCode: { type: "string", required: false, input: false },
      onboardingStep: { type: "number", required: false, input: false },
    },
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        // Stop billing before the account and its data are removed.
        await cancelStripeSubscriptionForUser(user.id);
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 40,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const u = user as typeof user & { dateOfBirth?: Date | string | null; referredById?: string | null };
          const dob = u.dateOfBirth ? new Date(u.dateOfBirth) : null;
          if (!dob || Number.isNaN(dob.getTime())) {
            throw new APIError("BAD_REQUEST", { message: "Date of birth is required to create an account." });
          }
          if (yearsBetween(dob, new Date()) < MIN_AGE_YEARS) {
            throw new APIError("BAD_REQUEST", { message: `You must be at least ${MIN_AGE_YEARS} to use EDGEWISE.` });
          }
          // The sign-up form passes a referral *code* in `referredById`; resolve it to a user id.
          let referredById: string | null = null;
          if (u.referredById) {
            const ref = await db.user.findUnique({ where: { referralCode: String(u.referredById).trim().toUpperCase() }, select: { id: true } });
            referredById = ref?.id ?? null;
          }
          const isAdmin = config.adminEmails.includes(user.email.toLowerCase());
          return {
            data: {
              ...user,
              dateOfBirth: dob,
              referredById,
              referralCode: makeReferralCode(),
              acceptedTermsAt: new Date(),
              responsibleUseAckAt: new Date(),
              role: isAdmin ? "admin" : "user",
            },
          };
        },
        after: async (user) => {
          await onUserCreated(user.id);
        },
      },
      update: {
        before: async (data) => {
          // Date of birth and referrer are fixed at sign-up.
          const rest = { ...(data as Record<string, unknown>) };
          delete rest.dateOfBirth;
          delete rest.referredById;
          return { data: rest };
        },
      },
    },
  },
  plugins: [admin(), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
