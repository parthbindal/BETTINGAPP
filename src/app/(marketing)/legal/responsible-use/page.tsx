import { Markdown } from "@/components/shared/markdown";
import { getArticle } from "@/content/articles";
export const metadata = { title: "Responsible Use" };
export default function Page() {
  const a = getArticle("responsible-analysis")!;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Responsible use</h1>
      <div className="mt-6"><Markdown className="text-[15px]">{a.body}</Markdown></div>
      <div className="card-surface mt-8 p-5 text-sm">
        <div className="font-semibold">Need help now?</div>
        <p className="mt-1 text-muted-foreground">United States: call or text <strong>1-800-GAMBLER</strong>. National Council on Problem Gambling: ncpgambling.org. International: contact your local helpline.</p>
      </div>
    </div>
  );
}
