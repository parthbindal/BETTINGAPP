import { AppShell } from "@/components/layout/app-shell";
import { AutoRefresh } from "@/components/whales/auto-refresh";

/**
 * Authenticated layout.
 *
 * Every page in this group is fully personalized: it calls requireUser(), which
 * reads the session, and then renders the signed-in member's own data. There is
 * no meaningful user-independent static shell to prerender, so these routes are
 * declared blocking rather than instant. The chrome (AppShell) still prerenders,
 * and loading.tsx streams a skeleton during client navigation.
 *
 * instant = false opts this whole subtree out of instant-navigation validation;
 * it does not affect the marketing or auth routes, which stay static/streamed.
 */
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {/* Mounted once for the whole signed-in app: opening it, or returning to its tab, brings the data up to date. */}
      <AutoRefresh />
      {children}
    </AppShell>
  );
}
