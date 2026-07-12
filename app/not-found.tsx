import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-6xl font-bold text-surface-300 mb-4">404</h1>
      <h2 className="text-xl font-semibold text-surface-200 mb-2">
        Page Not Found
      </h2>
      <p className="text-sm text-surface-400 mb-6 max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
      >
        ← Back to Dashboard
      </Link>
    </div>
  );
}
