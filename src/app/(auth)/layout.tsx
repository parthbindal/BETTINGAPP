import { Logo } from "@/components/marketing/logo";
import { Disclaimer } from "@/components/shared/page-header";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-8" />
      <div className="w-full max-w-md">{children}</div>
      <Disclaimer className="mt-8 max-w-md text-center" />
    </div>
  );
}
