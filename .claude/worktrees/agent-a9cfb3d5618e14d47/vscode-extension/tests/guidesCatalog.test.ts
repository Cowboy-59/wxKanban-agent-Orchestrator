// [SCOPE 066 / Guides] BEGIN — unit tests for the downloadable-guide catalog
import { describe, it, expect } from 'vitest';
import { groupGuides, loadGuideCatalog } from '../src/services/guidesCatalog';

function fakeFetch(handler: (url: string) => Promise<Response> | Response): typeof fetch {
  return ((url: string) => Promise.resolve(handler(url))) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'id-1',
  assetkey: 'guide-wxconversion',
  title: 'Migrating WinDev/WebDev to wxKanban and AI',
  content: 'How to bring a legacy WINDEV app across.',
  fileurl: 'https://cdn.example/public/a/EN.pdf',
  category: 'migrationguides',
  locale: 'en-US',
  ...over,
});

describe('groupGuides', () => {
  it('groups locale variants of one guide into a single entry', () => {
    const out = groupGuides([
      row({ id: '1', locale: 'en-US', fileurl: 'u/EN.pdf' }),
      row({ id: '2', locale: 'fr-FR', fileurl: 'u/FR.pdf' }),
      row({ id: '3', locale: 'de-DE', fileurl: 'u/DE.pdf' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].variants.map((v) => v.language)).toEqual(['English', 'Deutsch', 'Français']);
  });

  it('merges rows filed under different assetkeys but the same title', () => {
    // The live library has this exact split: the same guide's translations sit
    // under two assetkeys, which would otherwise render the title twice.
    const out = groupGuides([
      row({ id: '1', assetkey: 'guide-wxconversion', locale: 'fr-FR', fileurl: 'u/FR.pdf' }),
      row({ id: '2', assetkey: 'guide-wxkanban-migration', locale: 'en-US', fileurl: 'u/EN.pdf' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].variants).toHaveLength(2);
  });

  it('matches titles case-insensitively (pt row differs only in casing)', () => {
    const out = groupGuides([
      row({ id: '1', locale: 'en-US', fileurl: 'u/EN.pdf' }),
      row({ id: '2', title: 'Migrating Windev/Webdev to wxKanban and AI', locale: 'pt-PT', fileurl: 'u/PT.pdf' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].variants.map((v) => v.language)).toEqual(['English', 'Português']);
  });

  it('sorts English first, then the rest alphabetically by language name', () => {
    const out = groupGuides([
      row({ id: '1', locale: 'pt-PT', fileurl: 'u/PT.pdf' }),
      row({ id: '2', locale: 'it-IT', fileurl: 'u/IT.pdf' }),
      row({ id: '3', locale: 'en-US', fileurl: 'u/EN.pdf' }),
      row({ id: '4', locale: 'es-ES', fileurl: 'u/ES.pdf' }),
    ]);
    expect(out[0].variants.map((v) => v.language)).toEqual(['English', 'Español', 'Italiano', 'Português']);
  });

  it('takes the summary from the first row that has one', () => {
    const out = groupGuides([
      row({ id: '1', locale: 'pt-PT', content: null, fileurl: 'u/PT.pdf' }),
      row({ id: '2', locale: 'en-US', content: 'The real description.', fileurl: 'u/EN.pdf' }),
    ]);
    expect(out[0].summary).toBe('The real description.');
  });

  it('drops rows with no file to download', () => {
    expect(groupGuides([row({ fileurl: null })])).toEqual([]);
  });
});

describe('loadGuideCatalog', () => {
  it('requests the public guide index with no locale filter', async () => {
    const f = fakeFetch((url) => {
      expect(url).toBe('https://wxkanban.wxperts.com/api/help/guides');
      return jsonResponse({ success: true, data: [row()] });
    });
    const out = await loadGuideCatalog(f);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Migrating WinDev/WebDev to wxKanban and AI');
    expect(out[0].variants[0].fileUrl).toBe('https://cdn.example/public/a/EN.pdf');
  });

  it('returns [] on a non-2xx response', async () => {
    expect(await loadGuideCatalog(fakeFetch(() => jsonResponse({}, false, 500)))).toEqual([]);
  });

  it('returns [] when the fetch throws (offline)', async () => {
    const f = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(await loadGuideCatalog(f)).toEqual([]);
  });

  it('returns [] on a body with no data array', async () => {
    expect(await loadGuideCatalog(fakeFetch(() => jsonResponse({ success: true })))).toEqual([]);
  });
});
// [SCOPE 066 / Guides] END

// [SCOPE 066 / Guides] BEGIN — title casing follows the English row
describe('groupGuides title casing', () => {
  it('displays the English row title even when a translation was uploaded later', () => {
    // Live order: rows come back newest-first, and the pt row is the newest.
    const out = groupGuides([
      row({ id: '1', title: 'Migrating Windev/Webdev to wxKanban and AI', locale: 'pt-PT', fileurl: 'u/PT.pdf' }),
      row({ id: '2', title: 'Migrating WinDev/WebDev to wxKanban and AI', locale: 'en-US', fileurl: 'u/EN.pdf' }),
    ]);
    expect(out[0].title).toBe('Migrating WinDev/WebDev to wxKanban and AI');
  });
});
// [SCOPE 066 / Guides] END
