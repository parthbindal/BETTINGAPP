import { notFound, redirect } from "next/navigation";
import { SPORTS } from "@/lib/data/sports";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

/** Every covered league lives on the /sports hub; old per-sport links land there. */
export default async function SportPage({ params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params;
  if (!SPORTS.some((s) => s.key === sport)) notFound();
  redirect("/sports");
}
