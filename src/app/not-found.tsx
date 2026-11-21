import Link from "next/link";
import { Logo } from "@/components/marketing/logo";
import { LinkButton } from "@/components/ui/link-button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">That page does not exist, or the market or player it referred to is no longer available.</p>
      <div className="flex gap-2">
        <LinkButton href="/" variant="outline" size="sm">
          Home
        </LinkButton>
        <LinkButton href="/overview" size="sm">
          Dashboard
        </LinkButton>
      </div>
      <Link href="/markets" className="text-xs text-primary hover:underline">
        Browse markets
      </Link>
    </div>
  );
}
