/**
 * Bio locale resolution — unit tests for SCOPE-100 / T003 (FR-003).
 *
 * Guards US2: exactly ONE bio is returned, never one per language. The FAQ endpoint
 * shipped that defect (help.ts:289-292) and had to be repaired; this reuses its
 * scoring so the bio does not repeat it.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeLang,
  scoreLocale,
  pickBestByLocale,
  hasPublishedEnglish,
} from "../../src/shared/bio/locale";

const rows = [
  { locale: "en-US", title: "English" },
  { locale: "fr-FR", title: "French" },
  { locale: "de-DE", title: "German" },
];

describe("normalizeLang", () => {
  it("reduces a locale to its bare language", () => {
    expect(normalizeLang("fr-FR")).toBe("fr");
  });
  it("accepts an underscore separator", () => {
    expect(normalizeLang("pt_BR")).toBe("pt");
  });
  it("lowercases", () => {
    expect(normalizeLang("EN-US")).toBe("en");
  });
  it("returns empty for empty input", () => {
    expect(normalizeLang("")).toBe("");
  });
});

describe("scoreLocale", () => {
  it("scores the requested language highest", () => {
    expect(scoreLocale("fr-FR", "fr")).toBe(2);
  });
  it("scores English above other languages", () => {
    expect(scoreLocale("en-US", "fr")).toBe(1);
  });
  it("scores an unrelated language lowest", () => {
    expect(scoreLocale("de-DE", "fr")).toBe(0);
  });
  it("scores English at 1 when nothing was requested", () => {
    expect(scoreLocale("en-US", "")).toBe(1);
  });
  it("scores a full locale as requested language (fr-FR vs fr-FR)", () => {
    expect(scoreLocale("fr-FR", "fr-FR")).toBe(2);
  });
  it("scores a full locale as requested language with different casing (fr-FR vs FR)", () => {
    expect(scoreLocale("fr-FR", "FR")).toBe(2);
  });
});

describe("pickBestByLocale", () => {
  it("returns exactly one row, never one per language", () => {
    const best = pickBestByLocale(rows, "fr-FR");
    expect(best).not.toBeNull();
    expect(best?.locale).toBe("fr-FR");
  });

  it("falls back to English for an untranslated locale", () => {
    expect(pickBestByLocale(rows, "ja-JP")?.locale).toBe("en-US");
  });

  it("falls back to English when no locale is requested", () => {
    expect(pickBestByLocale(rows, "")?.locale).toBe("en-US");
  });

  it("returns any row when neither the request nor English is present", () => {
    const only = [{ locale: "it-IT", title: "Italian" }];
    expect(pickBestByLocale(only, "fr-FR")?.locale).toBe("it-IT");
  });

  it("returns null for no rows", () => {
    expect(pickBestByLocale([], "fr-FR")).toBeNull();
  });

  it("matches on bare language, so fr matches fr-FR", () => {
    expect(pickBestByLocale(rows, "fr")?.locale).toBe("fr-FR");
  });
});

describe("hasPublishedEnglish", () => {
  // Guards US6 / FR-003: the whole-branch review found that a Translate press
  // hardcoded status:"published" on the 5 locale rows regardless of the en-US row's
  // own status. Because a new en-US row defaults to "draft" and save() never sends
  // status, an English visitor could be served a published NON-English translation —
  // every row scored 0 in pickBestByLocale and the first one won. This gate must
  // report false whenever the English row itself isn't published, independent of how
  // many translations are published.
  it("is false when en-US is draft, even with 5 published translations", () => {
    const rowsGroup = [
      { locale: "en-US", status: "draft" },
      { locale: "fr-FR", status: "published" },
      { locale: "de-DE", status: "published" },
      { locale: "es-ES", status: "published" },
      { locale: "it-IT", status: "published" },
      { locale: "pt-BR", status: "published" },
    ];
    expect(hasPublishedEnglish(rowsGroup)).toBe(false);
  });

  it("is true when en-US is published, even if every translation is still draft", () => {
    const rowsGroup = [
      { locale: "en-US", status: "published" },
      { locale: "fr-FR", status: "draft" },
    ];
    expect(hasPublishedEnglish(rowsGroup)).toBe(true);
  });

  it("is false when there is no en-US row at all", () => {
    expect(hasPublishedEnglish([{ locale: "fr-FR", status: "published" }])).toBe(false);
  });

  it("is false for an empty group", () => {
    expect(hasPublishedEnglish([])).toBe(false);
  });

  it("matches on bare language, so any en-* published row satisfies the gate", () => {
    expect(hasPublishedEnglish([{ locale: "en-GB", status: "published" }])).toBe(true);
  });
});

describe("resolveBio (route-level composition, T016 regression fix)", () => {
  // src/server/routes/bio.ts resolves a request by gating on hasPublishedEnglish() and
  // then picking with pickBestByLocale() over the WHOLE fetched row group — no
  // status==='published' filter runs between those two steps. This mirrors that
  // composition as a pure function so the fix is covered without any DB or route
  // integration harness (there is none in this repo).
  //
  // Why the filter had to go: BioTranslationService's upsert inherits the en-US row's
  // own status (T015, closing a real bug) instead of hardcoding "published". Combined
  // with save() never sending status (schema default "draft") and setBioStatus() only
  // ever PATCHing the en-US row, the scope's own US1 happy path — save, translate,
  // THEN publish — left all 5 locale rows permanently stuck at status:"draft" even
  // after en-US went live. A status==='published' filter on candidates dropped those 5
  // rows from every non-English request, silently serving English prose to every other
  // locale. hasPublishedEnglish() is the only publish decision that should matter.
  type Row = { locale: string; status: string; content: string };

  function resolveBio(rows: Row[], requested: string): Row | null {
    if (!hasPublishedEnglish(rows)) return null;
    return pickBestByLocale(rows, requested);
  }

  const publishedEnDraftTranslations: Row[] = [
    { locale: "en-US", status: "published", content: "English bio" },
    { locale: "fr-FR", status: "draft", content: "Bio francaise" },
    { locale: "de-DE", status: "draft", content: "Deutsche Bio" },
    { locale: "es-ES", status: "draft", content: "Biografia espanola" },
    { locale: "it-IT", status: "draft", content: "Biografia italiana" },
    { locale: "pt-BR", status: "draft", content: "Biografia portuguesa" },
  ];

  it("US1 happy path: en-US published + still-draft translations still serve the translated locale, not English", () => {
    const best = resolveBio(publishedEnDraftTranslations, "fr-FR");
    expect(best?.locale).toBe("fr-FR");
    expect(best?.content).toBe("Bio francaise");
  });

  it("still resolves every one of the 5 draft-status translations, not just the requested one", () => {
    for (const locale of ["fr-FR", "de-DE", "es-ES", "it-IT", "pt-BR"]) {
      expect(resolveBio(publishedEnDraftTranslations, locale)?.locale).toBe(locale);
    }
  });

  it("must-still-hold: en-US draft blocks every locale, regardless of translation status", () => {
    const rowsGroup: Row[] = [
      { locale: "en-US", status: "draft", content: "English bio" },
      { locale: "fr-FR", status: "published", content: "Bio francaise" },
      { locale: "pt-BR", status: "draft", content: "Biografia portuguesa" },
    ];
    expect(resolveBio(rowsGroup, "fr-FR")).toBeNull();
    expect(resolveBio(rowsGroup, "pt-BR")).toBeNull();
    expect(resolveBio(rowsGroup, "")).toBeNull();
  });

  it("must-still-hold: un-publishing en-US alone takes every locale offline, even already-published translations", () => {
    const stillLiveBeforeUnpublish = resolveBio(publishedEnDraftTranslations, "fr-FR");
    expect(stillLiveBeforeUnpublish).not.toBeNull();

    const unpublished = publishedEnDraftTranslations.map((row) =>
      row.locale === "en-US" ? { ...row, status: "draft" } : row,
    );
    expect(resolveBio(unpublished, "fr-FR")).toBeNull();
    expect(resolveBio(unpublished, "")).toBeNull();
  });

  it("must-still-hold: exactly one row resolves per request, never one per locale", () => {
    const best = resolveBio(publishedEnDraftTranslations, "de-DE");
    expect(best).not.toBeNull();
    expect(Array.isArray(best)).toBe(false);
  });
});
