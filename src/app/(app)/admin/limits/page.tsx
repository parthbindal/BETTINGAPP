import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { PLANS, TIER_ORDER } from "@/lib/subscriptions/plans";
import { Section } from "@/components/shared/page-header";
import { LimitEditor } from "@/components/admin/admin-forms";
import { ActionButton } from "@/components/shared/action-button";
import { cn } from "@/lib/utils";

/** Personalized and blocking by design (see (app)/layout.tsx); opt out of instant-navigation validation. */
export const instant = false;

export default async function AdminLimitsPage() {
  await requireAdmin();
  const overrides = await db.featureLimitOverride.findMany();
  const byKey = new Map(overrides.map((o) => [o.key, o.value]));
  const defaults = PLANS.free.limits as unknown as Record<string, unknown>;
  const keys = Object.keys(defaults)
    .filter((k) => typeof defaults[k] === "number" || typeof defaults[k] === "boolean")
    .map((k) => ({ key: k, type: typeof defaults[k] as "number" | "boolean" }));
  const show = (v: unknown) => (typeof v === "boolean" ? (v ? "On" : "Off") : String(v));
  return (
    <div className="space-y-4">
      <Section title="Feature limits" description="Plan defaults live in code (src/lib/subscriptions/plans.ts). Overrides here take effect immediately, without a deploy.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 font-medium">Limit</th>
                {TIER_ORDER.map((t) => (
                  <th key={t} className="py-1.5 text-right font-medium capitalize">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map(({ key }) => (
                <tr key={key} className="border-t border-border/50">
                  <td className="py-1.5 font-mono text-xs">{key}</td>
                  {TIER_ORDER.map((t) => {
                    const def = (PLANS[t].limits as unknown as Record<string, unknown>)[key];
                    const ov = byKey.get(`${t}.${key}`);
                    return (
                      <td key={t} className={cn("tabular py-1.5 text-right", ov !== undefined && "text-primary")}>
                        {ov !== undefined ? (
                          <span title={`Default ${show(def)}`}>
                            {show(ov)} <span className="text-[10px] text-muted-foreground">(default {show(def)})</span>
                          </span>
                        ) : (
                          show(def)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Add or change an override">
          <LimitEditor keys={keys} />
        </Section>
        <Section title="Active overrides">
          {overrides.length ? (
            <ul className="space-y-2">
              {overrides.map((o) => (
                <li key={o.key} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="font-mono text-xs">{o.key}</span> = <span className="tabular">{show(o.value)}</span>
                  </span>
                  <ActionButton href={`/api/admin/limits?key=${encodeURIComponent(o.key)}`} method="DELETE" size="xs" variant="ghost">
                    Remove
                  </ActionButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No overrides. All plans use their defaults.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
