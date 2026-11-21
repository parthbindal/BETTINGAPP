import { AlertTriangle } from "lucide-react";
export function DemoBanner({ configured }: { configured: boolean }) {
  if (configured) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-status-serious/40 bg-status-serious/10 px-3 py-2 text-xs text-status-serious">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <strong>Sample data.</strong> No licensed sports data provider is configured, so all teams, players, games, statistics and projection lines shown here are fictional demo data generated to exercise the analytics engine. Set a provider key (see .env.example) to connect real data.
      </span>
    </div>
  );
}
