import { redirect } from "next/navigation";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

export default function SettingsIndex() {
  redirect("/settings/subscription");
}
