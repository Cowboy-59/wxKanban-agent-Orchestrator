import { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Shared chrome for the public, logged-out content pages (About / Privacy / Terms).
 * Header with logo + back-to-home, a readable content column, and a footer link row
 * matching the landing-page footer (About · Privacy · Terms · Contact).
 */
export function StaticPageLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
          <Link to="/" className="font-bold text-lg">wxKanban</Link>
          <Link to="/" className="text-sm text-blue-600 hover:underline dark:text-blue-300">
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 flex-1 w-full">
        <h1 className="text-3xl font-bold text-foreground mb-2">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>}
        <div className="space-y-4 text-[15px] leading-relaxed text-muted-foreground">
          {children}
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-3xl mx-auto px-4 py-8 text-center text-sm text-muted-foreground">
          <nav className="flex flex-wrap justify-center gap-5 mb-3">
            <Link to="/about" className="hover:text-foreground">About</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <a href="mailto:admin@wxperts.com" className="hover:text-foreground">Contact</a>
          </nav>
          <p>wxKanban — by wxPerts LLC · <a href="mailto:admin@wxperts.com" className="hover:text-foreground">admin@wxperts.com</a></p>
        </div>
      </footer>
    </div>
  );
}

// Small content helpers so each page reads cleanly.
export function H2({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-semibold text-foreground mt-8 mb-2">{children}</h2>;
}
