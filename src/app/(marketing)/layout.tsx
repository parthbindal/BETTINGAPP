import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/marketing/logo";
import { LinkButton } from "@/components/ui/link-button";
import { Disclaimer } from "@/components/shared/page-header";
import { getSession } from "@/lib/session";

const NAV = [
  { href: "/track-record", label: "Track record" },
  { href: "/whales", label: "Leaderboard" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/tools", label: "Free tools" },
  { href: "/learn", label: "Learn" },
];

function SignedOutCta() {
  return (
    <>
      <LinkButton href="/sign-in" variant="ghost" size="sm">
        Sign in
      </LinkButton>
      <LinkButton href="/sign-up" size="sm">
        Get started
      </LinkButton>
    </>
  );
}

/** Reads the session, so it streams in behind a boundary; the rest of the page is static. */
async function AuthCta() {
  // Request-time by declaration: the session check reads the clock, which must
  // never run while the static shell is being prerendered.
  await connection();
  const session = await getSession();
  if (!session) return <SignedOutCta />;
  return (
    <LinkButton href="/overview" size="sm">
      Open dashboard
    </LinkButton>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex" aria-label="Site">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-foreground">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Suspense fallback={<SignedOutCta />}>
              <AuthCta />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/60">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-3 max-w-md text-sm text-muted-foreground">Follow the Smart Money. Polymarket trader intelligence with every number sourced and timestamped. Educational and analytical; EDGEWISE never places wagers.</p>
            <Disclaimer className="mt-4 max-w-md" />
          </div>
          <div className="text-sm">
            <div className="mb-2 font-medium">Product</div>
            <ul className="space-y-1.5 text-muted-foreground">
              <li><Link href="/track-record" className="hover:text-foreground">Track record</Link></li>
              <li><Link href="/pricing" className="hover:text-foreground">Pricing</Link></li>
              <li><Link href="/tools" className="hover:text-foreground">Free tools</Link></li>
              <li><Link href="/learn" className="hover:text-foreground">Articles</Link></li>
              <li><Link href="/sign-up" className="hover:text-foreground">Create account</Link></li>
            </ul>
          </div>
          <div className="text-sm">
            <div className="mb-2 font-medium">Legal</div>
            <ul className="space-y-1.5 text-muted-foreground">
              <li><Link href="/legal/terms" className="hover:text-foreground">Terms of service</Link></li>
              <li><Link href="/legal/privacy" className="hover:text-foreground">Privacy policy</Link></li>
              <li><Link href="/legal/responsible-use" className="hover:text-foreground">Responsible use</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
