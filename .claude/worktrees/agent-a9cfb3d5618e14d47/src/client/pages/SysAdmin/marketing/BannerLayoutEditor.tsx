import { useEffect, useRef, useState } from 'react';
import { X, RotateCcw, Save, Eye, EyeOff } from 'lucide-react';

// [SCOPE 070 / Amendment-D] BEGIN — Banner drag/resize layout editor
// A WYSIWYG editor for per-element overlay placement. The background is the AI
// image; each overlay element is a draggable + resizable box. Positions persist
// as { [key]: { x, y, scale } } (x,y = 0..1 of w,h; scale × auto font size) and
// the server renderer (buildAbsoluteOverlay) draws at the SAME coordinates/sizes
// with the same Inter font, so what you arrange here is what renders.

// [SCOPE 070 / Amendment-F] hidden:true deletes the element from the canvas + render.
export type Placement = { x: number; y: number; scale: number; hidden?: boolean };
export type OverlayMap = Record<string, Placement>;

// Brand tokens mirrored from src/server/lib/banner-brand.ts for preview fidelity.
const BRAND = {
  accent: '#c8761b',
  onAccent: '#ffffff',
  onDark: '#e7ecf4',
  eyebrowColor: '#7fe9cf',
  accentGradient: 'linear-gradient(90deg, #28e0b0 0%, #19b8e6 100%)',
  logoUrl: 'https://windev.wxperts.com/wxKanbanLight.png',
};

function clampPx(min: number, pref: number, max: number) {
  return Math.max(min, Math.min(pref, max));
}

// Mirrors server typeScale() so preview font sizes match the render.
function typeScale(layout: string, w: number, h: number) {
  if (layout === 'horizontal') {
    return {
      headline: clampPx(11, 0.34 * h, 28),
      eyebrow: clampPx(8, 0.16 * h, 13),
      body: clampPx(8, 0.16 * h, 13),
      cta: clampPx(9, 0.26 * h, 17),
      ctaUrl: clampPx(8, 0.18 * h, 14),
      badge: clampPx(8, 0.18 * h, 13),
      logoH: clampPx(14, 0.4 * h, 30),
    };
  }
  if (layout === 'vertical') {
    return {
      headline: clampPx(14, Math.min(0.052 * h, 0.12 * w), 32),
      eyebrow: clampPx(8, Math.min(0.019 * h, 0.05 * w), 14),
      body: clampPx(9, Math.min(0.022 * h, 0.06 * w), 16),
      cta: clampPx(10, Math.min(0.024 * h, 0.065 * w), 16),
      ctaUrl: clampPx(8, Math.min(0.019 * h, 0.05 * w), 14),
      badge: clampPx(8, Math.min(0.019 * h, 0.05 * w), 13),
      logoH: clampPx(16, 0.045 * h, 34),
    };
  }
  return {
    headline: clampPx(16, 0.085 * h, 56),
    eyebrow: clampPx(9, 0.026 * h, 20),
    body: clampPx(10, 0.03 * h, 22),
    cta: clampPx(10, 0.032 * h, 22),
    ctaUrl: clampPx(9, 0.024 * h, 18),
    badge: clampPx(9, 0.024 * h, 17),
    logoH: clampPx(18, 0.06 * h, 44),
  };
}

export interface BannerLayoutContent {
  eyebrow: string | null;
  headlinesegments: { text: string; accent?: boolean }[];
  subhead: string | null;
  bulletslabel: string | null;
  bullets: string[];
  badge: string | null;
  ctatext: string | null;
  ctaurl: string | null;
}

interface Props {
  width: number;
  height: number;
  layout: string;
  backgroundUrl: string | null;
  content: BannerLayoutContent;
  value: OverlayMap | null;
  onSave: (map: OverlayMap) => void;
  onReset: () => void;
  onClose: () => void;
  saving?: boolean;
}

type ElementKey =
  | 'logo'
  | 'eyebrow'
  | 'headline'
  | 'subhead'
  | 'bullets'
  | 'cta'
  | 'badge';

// Load Inter once so preview text matches the bundled render font.
function useInterFont() {
  useEffect(() => {
    const id = 'inter-font-link';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;800&display=swap';
    document.head.appendChild(link);
  }, []);
}

export default function BannerLayoutEditor({
  width,
  height,
  layout,
  backgroundUrl,
  content,
  value,
  onSave,
  onReset,
  onClose,
  saving,
}: Props) {
  useInterFont();
  const ts = typeScale(layout, width, height);

  // Which elements are present (have content).
  const present: ElementKey[] = [
    'logo',
    ...(content.eyebrow ? (['eyebrow'] as ElementKey[]) : []),
    ...(content.headlinesegments.length ? (['headline'] as ElementKey[]) : []),
    ...(content.subhead ? (['subhead'] as ElementKey[]) : []),
    ...(content.bullets.length ? (['bullets'] as ElementKey[]) : []),
    ...(content.ctatext || content.ctaurl ? (['cta'] as ElementKey[]) : []),
    ...(content.badge ? (['badge'] as ElementKey[]) : []),
  ];

  // Element pixel heights (banner space) used to seed a clean default stack.
  const elemHeight = (key: ElementKey): number => {
    switch (key) {
      case 'logo':
        return ts.logoH;
      case 'eyebrow':
        return ts.eyebrow * 1.4;
      case 'headline':
        return content.headlinesegments.length * ts.headline * 1.14;
      case 'subhead':
        return ts.body * 1.5;
      case 'bullets':
        return (content.bullets.length + (content.bulletslabel ? 1 : 0)) * ts.body * 1.32;
      case 'cta':
        return ts.cta * 2.0;
      case 'badge':
        return ts.badge * 1.9;
    }
  };

  const seed = (): OverlayMap => {
    const map: OverlayMap = {};
    let yPx = 0.06 * height;
    const gap = 0.03 * height;
    for (const key of present) {
      if (key === 'badge') {
        map.badge = { x: 0.78, y: 0.06, scale: 1 };
        continue;
      }
      map[key] = { x: 0.06, y: Math.min(0.92, yPx / height), scale: 1 };
      yPx += elemHeight(key) + gap;
    }
    return map;
  };

  const [map, setMap] = useState<OverlayMap>(() =>
    value && Object.keys(value).length ? value : seed(),
  );
  const mapRef = useRef(map);
  mapRef.current = map;

  // [SCOPE 070 / Amendment-F] per-element delete: hidden elements drop off the canvas
  // (and the render skips them) but stay restorable via the chips below the toolbar.
  const ELEMENT_LABEL: Record<ElementKey, string> = {
    logo: 'Logo',
    eyebrow: 'Eyebrow',
    headline: 'Headline',
    subhead: 'Sub-line',
    bullets: 'Bullets',
    cta: 'CTA',
    badge: 'Badge',
  };
  const visible = present.filter((k) => !map[k]?.hidden);
  const hideEl = (key: ElementKey) =>
    setMap((m) => ({
      ...m,
      [key]: { ...(m[key] ?? { x: 0.06, y: 0.5, scale: 1 }), hidden: true },
    }));
  const showEl = (key: ElementKey) =>
    setMap((m) => (m[key] ? { ...m, [key]: { ...m[key], hidden: false } } : m));
  const toggleEl = (key: ElementKey) =>
    map[key]?.hidden ? showEl(key) : hideEl(key);

  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    key: ElementKey;
    mode: 'move' | 'resize';
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    oScale: number;
    pw: number;
    ph: number;
  } | null>(null);

  // Fit the preview within a sensible box.
  const maxW = 660;
  const maxH = 540;
  const scale = Math.min(maxW / width, maxH / height);
  const pw = width * scale;
  const ph = height * scale;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const cur = mapRef.current[d.key] ?? { x: 0, y: 0, scale: 1 };
      if (d.mode === 'move') {
        const nx = Math.max(0, Math.min(0.98, d.ox + (e.clientX - d.sx) / d.pw));
        const ny = Math.max(0, Math.min(0.98, d.oy + (e.clientY - d.sy) / d.ph));
        setMap((m) => ({ ...m, [d.key]: { ...cur, x: nx, y: ny } }));
      } else {
        const ns = Math.max(0.3, Math.min(5, d.oScale + (e.clientY - d.sy) / 120));
        setMap((m) => ({ ...m, [d.key]: { ...cur, scale: ns } }));
      }
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const startMove = (key: ElementKey, e: React.PointerEvent) => {
    e.preventDefault();
    const cur = map[key] ?? { x: 0, y: 0, scale: 1 };
    drag.current = {
      key,
      mode: 'move',
      sx: e.clientX,
      sy: e.clientY,
      ox: cur.x,
      oy: cur.y,
      oScale: cur.scale,
      pw,
      ph,
    };
  };
  const startResize = (key: ElementKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cur = map[key] ?? { x: 0, y: 0, scale: 1 };
    drag.current = {
      key,
      mode: 'resize',
      sx: e.clientX,
      sy: e.clientY,
      ox: cur.x,
      oy: cur.y,
      oScale: cur.scale,
      pw,
      ph,
    };
  };

  // px font size in preview = bannerFontPx * elementScale * previewScale
  const fpx = (base: number, s: number) => base * s * scale;

  const renderInner = (key: ElementKey, s: number) => {
    switch (key) {
      case 'logo':
        return (
          <img
            src={BRAND.logoUrl}
            alt=""
            draggable={false}
            style={{ height: fpx(ts.logoH, s), width: 'auto', display: 'block' }}
          />
        );
      case 'eyebrow':
        return (
          <div
            style={{
              color: BRAND.eyebrowColor,
              fontSize: fpx(ts.eyebrow, s),
              fontWeight: 800,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {content.eyebrow}
          </div>
        );
      case 'headline':
        return (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {content.headlinesegments.map((seg, i) => (
              <span
                key={i}
                style={
                  seg.accent
                    ? {
                        fontSize: fpx(ts.headline, s),
                        fontWeight: 800,
                        lineHeight: 1.14,
                        whiteSpace: 'nowrap',
                        background: BRAND.accentGradient,
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                      }
                    : {
                        fontSize: fpx(ts.headline, s),
                        fontWeight: 800,
                        lineHeight: 1.14,
                        whiteSpace: 'nowrap',
                        color: '#fff',
                      }
                }
              >
                {seg.text}
              </span>
            ))}
          </div>
        );
      case 'subhead':
        return (
          <div
            style={{
              color: BRAND.onDark,
              opacity: 0.92,
              fontSize: fpx(ts.body, s),
              maxWidth: pw * (1 - (map.subhead?.x ?? 0.06)) - 12,
            }}
          >
            {content.subhead}
          </div>
        );
      case 'bullets':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: fpx(ts.body, s) * 0.18 }}>
            {content.bulletslabel && (
              <div style={{ color: BRAND.onDark, fontWeight: 800, fontSize: fpx(ts.body, s) }}>
                {content.bulletslabel}
              </div>
            )}
            {content.bullets.map((b, i) => (
              <div key={i} style={{ color: BRAND.onDark, opacity: 0.82, fontSize: fpx(ts.body, s), whiteSpace: 'nowrap' }}>
                {'•  '}
                {b}
              </div>
            ))}
          </div>
        );
      case 'cta':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: fpx(ts.cta, s) * 0.8 }}>
            {content.ctatext && (
              <div
                style={{
                  background: BRAND.accentGradient,
                  color: BRAND.onAccent,
                  fontWeight: 800,
                  fontSize: fpx(ts.cta, s),
                  borderRadius: fpx(ts.cta, s) * 0.5,
                  padding: `${fpx(ts.cta, s) * 0.5}px ${fpx(ts.cta, s) * 0.9}px`,
                  whiteSpace: 'nowrap',
                }}
              >
                {content.ctatext}
              </div>
            )}
            {content.ctaurl && (
              <span style={{ color: BRAND.eyebrowColor, fontWeight: 800, fontSize: fpx(ts.ctaUrl, s), whiteSpace: 'nowrap' }}>
                {content.ctaurl}
              </span>
            )}
          </div>
        );
      case 'badge':
        return (
          <div
            style={{
              background: BRAND.accent,
              color: BRAND.onAccent,
              fontWeight: 800,
              fontSize: fpx(ts.badge, s),
              borderRadius: 999,
              padding: `${fpx(ts.badge, s) * 0.45}px ${fpx(ts.badge, s) * 0.8}px`,
              whiteSpace: 'nowrap',
            }}
          >
            {content.badge}
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 max-w-[90vw] max-h-[92vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-white text-sm font-semibold">
            Drag to move · drag the corner handle to resize
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onReset();
                onClose();
              }}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to auto
            </button>
            <button
              onClick={() => onSave(mapRef.current)}
              disabled={saving}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save layout'}
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200"
            >
              <X className="h-3.5 w-3.5" /> Close
            </button>
          </div>
        </div>

        {/* [SCOPE 070 / Amendment-F] element visibility toggles — reliable controls
            outside the clipped canvas; click to show/hide any element (e.g. hide
            everything except the CTA when the uploaded background is self-contained). */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">
            Elements — click to show / hide
          </span>
          {present.map((key) => {
            const hidden = !!map[key]?.hidden;
            return (
              <button
                key={key}
                onClick={() => toggleEl(key)}
                title={hidden ? `Show ${ELEMENT_LABEL[key]}` : `Hide ${ELEMENT_LABEL[key]}`}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md ${
                  hidden
                    ? 'bg-slate-800 text-slate-500 line-through'
                    : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                }`}
              >
                {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}{' '}
                {ELEMENT_LABEL[key]}
              </button>
            );
          })}
        </div>

        <div
          ref={boxRef}
          className="relative overflow-hidden rounded-md select-none"
          style={{
            width: pw,
            height: ph,
            backgroundColor: '#0f1722',
            fontFamily: 'Inter, system-ui, sans-serif',
            touchAction: 'none',
          }}
        >
          {backgroundUrl && (
            <img
              src={backgroundUrl}
              alt=""
              draggable={false}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          {/* scrim, matching the server's left→right navy gradient */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(90deg, rgba(15,23,34,0.82) 0%, rgba(15,23,34,0.45) 45%, rgba(15,23,34,0.12) 100%)',
            }}
          />
          {visible.map((key) => {
            const p = map[key] ?? { x: 0.06, y: 0.5, scale: 1 };
            return (
              <div
                key={key}
                onPointerDown={(e) => startMove(key, e)}
                style={{
                  position: 'absolute',
                  left: p.x * pw,
                  top: p.y * ph,
                  cursor: 'move',
                  outline: '1px dashed rgba(255,255,255,0.35)',
                  outlineOffset: 2,
                }}
              >
                {renderInner(key, p.scale)}
                <div
                  onPointerDown={(e) => startResize(key, e)}
                  title="Resize"
                  style={{
                    position: 'absolute',
                    right: -6,
                    bottom: -6,
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    background: '#6366f1',
                    cursor: 'nwse-resize',
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-slate-400 mt-2">
          Preview at {Math.round(scale * 100)}% · {width}×{height}. Save, then Render to produce the final PNG.
        </div>
      </div>
    </div>
  );
}
// [SCOPE 070 / Amendment-D] END
