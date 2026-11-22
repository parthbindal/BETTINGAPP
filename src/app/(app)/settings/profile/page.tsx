import { requireUser, getEntitlements } from "@/lib/session";
import { Section } from "@/components/shared/page-header";
import { ProfileForm, PasswordForm, DeleteAccountForm } from "@/components/settings/profile-forms";
import { dateShort } from "@/lib/format";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

export default async function ProfilePage() {
  const session = await requireUser("/settings/profile");
  const ent = await getEntitlements(session.user.id);
  const u = session.user;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Profile" description={`${u.email} · member since ${dateShort(u.createdAt)}`}>
        <ProfileForm initial={{ name: u.name, region: u.region ?? "United States", experienceLevel: u.experienceLevel ?? "beginner" }} />
      </Section>
      <Section title="Password">
        <PasswordForm />
      </Section>
      <Section title="Delete account" className="lg:col-span-2">
        <DeleteAccountForm hasPaidPlan={ent.source === "stripe"} />
      </Section>
    </div>
  );
}
