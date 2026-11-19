import { createLogger } from '~/server/lib/logger.js';

const logger = createLogger('image-provider');

// [SCOPE 070 / T002] BEGIN — Banner Studio AI image-generation provider
// MODIFIED-BY: [SCOPE 070 / Amendment-B] — add editImage() (in-place img2img edit via a
// Gemini image-edit model) + getImageEditModel()
// Image-only sibling of llm-provider.ts: generates a banner *background* from a prompt
// and returns raw PNG bytes. The headline/logo/CTA are a sharp HTML overlay (the render
// service), so the model never has to draw legible text. Default provider is Gemini
// Imagen (reuses GEMINI_API_KEY). Fail-open everywhere: any error — missing key, provider
// error, content-filter refusal, empty result — returns null and is logged; never throws.
export type ImageProvider = 'gemini-imagen' | 'openai-gpt-image';

export function getImageProvider(): ImageProvider {
  const raw = (process.env['IMAGE_PROVIDER'] || 'gemini-imagen').toLowerCase();
  if (raw === 'gemini-imagen' || raw === 'openai-gpt-image') return raw;
  logger.warn({ raw }, 'Unknown IMAGE_PROVIDER value — falling back to gemini-imagen');
  return 'gemini-imagen';
}

export function getImageModel(provider: ImageProvider): string {
  switch (provider) {
    case 'gemini-imagen':
      // Imagen 4 — Imagen 3 isn't exposed on this Gemini API project; v4 is. Both
      // require the project to be on the paid plan. Use -fast- for cheaper/quicker.
      return process.env['IMAGE_MODEL'] || 'imagen-4.0-generate-001';
    case 'openai-gpt-image':
      return process.env['IMAGE_MODEL'] || 'gpt-image-1';
  }
}

// Appended to every prompt so backgrounds stay on-brand and text-free. The brand layer
// (logo/colours/copy) is rendered by us as a crisp overlay — the model only paints atmosphere.
export const BRAND_PROMPT_SUFFIX =
  ' — professional marketing banner background, muted deep-navy base with warm amber accents, ' +
  'clean and modern with soft depth, generous empty negative space in the upper-left for a text ' +
  'overlay, absolutely no text, no words, no letters, no logos, no watermarks';

// Imagen renders at fixed aspect ratios, not arbitrary dimensions; pick the nearest and
// let the render service's `background-size: cover` crop to the exact banner size.
const IMAGEN_ASPECTS: ReadonlyArray<{ ratio: string; value: number }> = [
  { ratio: '1:1', value: 1 },
  { ratio: '3:4', value: 0.75 },
  { ratio: '4:3', value: 4 / 3 },
  { ratio: '9:16', value: 9 / 16 },
  { ratio: '16:9', value: 16 / 9 },
];

function nearestImagenAspect(width: number, height: number): string {
  const target = width / Math.max(height, 1);
  let best = IMAGEN_ASPECTS[0]!;
  for (const a of IMAGEN_ASPECTS) {
    if (Math.abs(a.value - target) < Math.abs(best.value - target)) best = a;
  }
  return best.ratio;
}

export interface GenerateImageOptions {
  width: number;
  height: number;
  provider?: ImageProvider;
  model?: string;
}

export interface GeneratedImage {
  bytes: Buffer;
  contentType: string;
}

export async function generateImage(
  prompt: string,
  opts: GenerateImageOptions,
): Promise<GeneratedImage | null> {
  const provider = opts.provider ?? getImageProvider();
  const model = opts.model ?? getImageModel(provider);
  const fullPrompt = `${prompt}${BRAND_PROMPT_SUFFIX}`;

  try {
    if (provider === 'gemini-imagen') {
      const apiKey = process.env['GEMINI_API_KEY'];
      if (!apiKey) {
        logger.warn('GEMINI_API_KEY not configured (IMAGE_PROVIDER=gemini-imagen)');
        return null;
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: fullPrompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: nearestImagenAspect(opts.width, opts.height),
          },
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        logger.error(
          { status: res.status, detail: detail.slice(0, 500) },
          'Imagen API error (fail-open)',
        );
        return null;
      }
      const data = (await res.json()) as {
        predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
      };
      const pred = data.predictions?.[0];
      if (!pred?.bytesBase64Encoded) {
        logger.warn('Imagen returned no image (likely content-filtered)');
        return null;
      }
      return {
        bytes: Buffer.from(pred.bytesBase64Encoded, 'base64'),
        contentType: pred.mimeType || 'image/png',
      };
    }

    // openai-gpt-image — env-flip-ready stub; not implemented in Phase 1.
    logger.warn({ provider }, 'IMAGE_PROVIDER not implemented in Phase 1 — no image generated');
    return null;
  } catch (err) {
    logger.error({ err }, 'generateImage failed (fail-open)');
    return null;
  }
}

// [SCOPE 070 / Amendment-B] BEGIN — in-place AI background edit (img2img)
// The edit model that accepts an input image + instruction and returns an edited image.
// Default gemini-2.5-flash-image ("Nano Banana"); env-flip via IMAGE_EDIT_MODEL.
export function getImageEditModel(): string {
  return process.env['IMAGE_EDIT_MODEL'] || 'gemini-2.5-flash-image';
}

// Appended to every edit instruction so the result stays a clean, text-free background
// suitable for our sharp overlay — same brand discipline as generation.
const EDIT_BRAND_SUFFIX =
  ' — keep this a clean, professional, text-free marketing banner background: no text, ' +
  'no words, no letters, no logos, no watermarks; preserve generous empty negative space ' +
  'for a separate text overlay; stay on-brand (deep navy base, warm accents).';

// Feed the current background + a free-text instruction to the image-edit model and return
// the edited PNG bytes. Fail-open everywhere — any error (missing key, provider error,
// content-filter refusal, no image in the response) returns null and is logged; never throws.
export async function editImage(
  currentImage: Buffer,
  instruction: string,
  opts: { mimeType?: string } = {},
): Promise<GeneratedImage | null> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    logger.warn('GEMINI_API_KEY not configured (image edit)');
    return null;
  }
  const model = getImageEditModel();
  const mimeType = opts.mimeType || 'image/png';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${instruction.trim()}${EDIT_BRAND_SUFFIX}` },
              { inline_data: { mime_type: mimeType, data: currentImage.toString('base64') } },
            ],
          },
        ],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error(
        { status: res.status, detail: detail.slice(0, 500) },
        'Image-edit API error (fail-open)',
      );
      return null;
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { data?: string; mimeType?: string };
            inline_data?: { data?: string; mime_type?: string };
          }>;
        };
      }>;
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      const b64 = p.inlineData?.data || p.inline_data?.data;
      const mt = p.inlineData?.mimeType || p.inline_data?.mime_type;
      if (b64) {
        return { bytes: Buffer.from(b64, 'base64'), contentType: mt || 'image/png' };
      }
    }
    logger.warn('Image-edit returned no image (likely content-filtered/refused)');
    return null;
  } catch (err) {
    logger.error({ err }, 'editImage failed (fail-open)');
    return null;
  }
}
// [SCOPE 070 / Amendment-B] END
// [SCOPE 070 / T002] END
