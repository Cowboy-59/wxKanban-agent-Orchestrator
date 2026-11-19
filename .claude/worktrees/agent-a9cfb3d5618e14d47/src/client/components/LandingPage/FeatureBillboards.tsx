import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "../../i18n";

// [SCOPE 096 / T008] Landing feature-billboard carousel. Reads the DB-backed
// public API (GET /api/marketing/feature-snippets) — published snippets only,
// ordered, with per-feature dwellMs/enhanced/ctaUrl and the locales that have
// copy. Billboard image URLs are built by convention from the slug + locale
// (public/feature-banners/<slug>.billboard.<locale>.png), falling back to en-US.
// Featured snippets get the enhanced treatment (slow zoom + pulsing glow). If the
// API returns nothing, the carousel renders nothing (FR-011).

interface ApiFeature {
  slug: string;
  name: string;
  link: string;
  ctaUrl: string | null;
  dwellMs: number;
  enhanced: boolean;
  locales: string[];
}
interface ApiResponse {
  locales: string[];
  features: ApiFeature[];
}

function billboardUrl(slug: string, locale: string): string {
  return `/feature-banners/${slug}.billboard.${locale}.png`;
}

export function FeatureBillboards() {
  const { locale } = useTranslation();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/marketing/feature-snippets")
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        if (alive) setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const localeFor = (f: ApiFeature): string =>
    f.locales.includes(locale) ? locale : "en-US";

  const slides = data?.features ?? [];

  // Advance after THIS slide's own dwell time.
  useEffect(() => {
    if (paused || slides.length < 2) return;
    const dwell = slides[idx]?.dwellMs ?? 5000;
    timer.current = window.setTimeout(
      () => setIdx((i) => (i + 1) % slides.length),
      dwell,
    );
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [idx, paused, slides.length]);

  // Reset when the site language changes (billboards follow the app locale).
  useEffect(() => {
    setIdx(0);
  }, [locale]);

  if (!slides.length) return null;

  const activeEnhanced = !!slides[idx]?.enhanced;
  const localesAvailable = data?.locales ?? [];

  return (
    <section aria-label="What wxKanban does" className="w-full bg-slate-950 py-6">
      <style>{`
        @keyframes fbbKen { from { transform: scale(1); } to { transform: scale(1.09); } }
        @keyframes fbbGlow {
          0%, 100% { box-shadow: 0 10px 40px rgba(168,85,247,0.55), 0 0 70px rgba(147,51,234,0.40); }
          50%      { box-shadow: 0 12px 55px rgba(168,85,247,0.90), 0 0 120px rgba(147,51,234,0.75); }
        }
        .fbb-panel-enhanced { animation: fbbGlow 3s ease-in-out infinite; }
        .fbb-ken { animation: fbbKen var(--fbb-dwell, 9s) ease-out both; }
      `}</style>

      <div className="max-w-6xl mx-auto px-4">
        <div
          className={
            "relative w-full overflow-hidden rounded-2xl" +
            (activeEnhanced ? " fbb-panel-enhanced" : "")
          }
          style={{
            aspectRatio: "1456 / 208",
            ...(activeEnhanced
              ? {}
              : {
                  boxShadow:
                    "0 10px 40px rgba(168,85,247,0.55), 0 0 70px rgba(147,51,234,0.4)",
                }),
          }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {slides.map((f, i) => {
            const active = i === idx;
            const enhance = active && f.enhanced;
            return (
              <a
                key={f.slug}
                href={f.link || "#"}
                className="absolute inset-0 transition-opacity duration-700"
                style={{
                  opacity: active ? 1 : 0,
                  pointerEvents: active ? "auto" : "none",
                }}
              >
                <img
                  src={billboardUrl(f.slug, localeFor(f))}
                  alt={f.name}
                  className={
                    "w-full h-full object-cover" + (enhance ? " fbb-ken" : "")
                  }
                  style={
                    enhance
                      ? ({ "--fbb-dwell": `${(f.dwellMs ?? 9000) / 1000}s` } as CSSProperties)
                      : undefined
                  }
                  loading={i === 0 ? "eager" : "lazy"}
                  onError={(e) => {
                    // A locale may have translated copy but no billboard art yet —
                    // fall back to the en-US billboard rather than showing a broken image.
                    const img = e.currentTarget;
                    const enUrl = billboardUrl(f.slug, "en-US");
                    if (!img.src.endsWith(enUrl)) img.src = enUrl;
                  }}
                />
              </a>
            );
          })}
        </div>
        <div className="flex justify-center gap-2 mt-4">
          {slides.map((f, i) => (
            <button
              key={f.slug}
              type="button"
              aria-label={f.name}
              aria-current={i === idx}
              onClick={() => setIdx(i)}
              className="h-2 w-2 rounded-full transition-all"
              style={{
                background:
                  i === idx
                    ? f.enhanced
                      ? "#a855f7"
                      : "#c8761b"
                    : "rgba(255,255,255,0.28)",
                transform: i === idx ? "scale(1.25)" : "none",
              }}
            />
          ))}
        </div>
        {/* localesAvailable reserved for a future language switch on the carousel */}
        <div className="sr-only">{localesAvailable.join(",")}</div>
      </div>
    </section>
  );
}
