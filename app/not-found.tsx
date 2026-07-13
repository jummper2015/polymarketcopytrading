import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Ghost } from "lucide-react";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-fade-in">
      <Ghost className="size-16 text-surface-600 mb-4" strokeWidth={1.5} />
      <h1 className="text-7xl font-bold text-surface-400 mb-2 tracking-tight">404</h1>
      <h2 className="text-xl font-semibold text-surface-200 mb-2">
        {t("title")}
      </h2>
      <p className="text-sm text-surface-400 mb-8 max-w-md leading-relaxed">
        {t("description")}
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-all duration-150 hover:gap-3 active:scale-[0.97] shadow-lg shadow-brand-500/20"
      >
        <ArrowLeft className="size-4" />
        {t("backToDash")}
      </Link>
    </div>
  );
}
