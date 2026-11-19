// [SCOPE 084 / T012] Locale-aware Help content layer.
//
// The Help generators (build-help-html.mts standalone page + HelpGenerator.ts
// stored doc) render from the English source (catalog.ts / articles.ts /
// guides.ts). This module overlays per-locale translations so the SAME generators
// can emit French/Spanish/Italian/German/Portuguese output. Translations live in
// ./i18n-data/<locale>.json (assembled from the SPEC-052 help translation pass);
// every string falls back to English per-field, so a missing overlay never breaks.

import { PLANS, CATEGORIES, HELP_FEATURES, type Plan, type HelpFeature } from './catalog.js';
import { HELP_GUIDES } from './guides.js';
import { HELP_ARTICLES, type HelpArticle } from './articles.js';
// Statically import the per-locale overlays so they inline into both the tsx run
// (standalone page build) AND the esbuild server bundle (stored-doc generation).
import frFR from './i18n-data/fr-FR.json' with { type: 'json' };
import esES from './i18n-data/es-ES.json' with { type: 'json' };
import itIT from './i18n-data/it-IT.json' with { type: 'json' };
import deDE from './i18n-data/de-DE.json' with { type: 'json' };
import ptBR from './i18n-data/pt-BR.json' with { type: 'json' };

export const HELP_LOCALES = ['en-US', 'fr-FR', 'es-ES', 'it-IT', 'de-DE', 'pt-BR'] as const;
export type HelpLocale = (typeof HELP_LOCALES)[number];

/** Short file suffix for a locale's standalone page (en-US → "", others → ".fr" etc.). */
export function localeSuffix(locale: HelpLocale): string {
  return locale === 'en-US' ? '' : `.${locale.slice(0, 2)}`;
}

interface HelpOverlay {
  features?: Record<string, { title?: string; description?: string; howTo?: string }>;
  categories?: Record<string, string>;
  plans?: Record<string, { label?: string; userLimit?: string; tagline?: string }>;
  guides?: Record<string, string[]>;
  articles?: Record<string, HelpArticle>;
}

const OVERLAYS: Record<HelpLocale, HelpOverlay> = {
  'en-US': {},
  'fr-FR': frFR as HelpOverlay,
  'es-ES': esES as HelpOverlay,
  'it-IT': itIT as HelpOverlay,
  'de-DE': deDE as HelpOverlay,
  'pt-BR': ptBR as HelpOverlay,
};

function loadOverlay(locale: HelpLocale): HelpOverlay {
  return OVERLAYS[locale] ?? {};
}

export interface LocalizedHelp {
  plans: Plan[];
  /** English category strings in render order (grouping keys). */
  categories: string[];
  /** English category → localized display label. */
  categoryLabel: (category: string) => string;
  /** Features with title/description/howTo localized; `category` stays the English key. */
  features: HelpFeature[];
  guides: Record<string, string[]>;
  articles: Record<string, HelpArticle>;
}

export function getLocalizedHelp(locale: HelpLocale): LocalizedHelp {
  const o = loadOverlay(locale);
  const plans: Plan[] = PLANS.map((p) => ({
    ...p,
    label: o.plans?.[p.id]?.label ?? p.label,
    userLimit: o.plans?.[p.id]?.userLimit ?? p.userLimit,
    tagline: o.plans?.[p.id]?.tagline ?? p.tagline,
  }));
  const features: HelpFeature[] = HELP_FEATURES.map((f) => ({
    ...f,
    title: o.features?.[f.id]?.title ?? f.title,
    description: o.features?.[f.id]?.description ?? f.description,
    howTo: o.features?.[f.id]?.howTo ?? f.howTo,
  }));
  const guides = { ...HELP_GUIDES, ...(o.guides ?? {}) };
  const articles = { ...HELP_ARTICLES, ...(o.articles ?? {}) };
  const categoryLabel = (category: string) => o.categories?.[category] ?? category;
  return { plans, categories: CATEGORIES, categoryLabel, features, guides, articles };
}

// ─── Chrome / UI strings (authored inline; short labels) ──────────────────────

export interface HelpUi {
  htmlLang: string;
  pageTitle: string;
  h1: string;
  lede: string;
  legendIncluded: string;
  legendUpgrade: string;
  included: string;
  notIncluded: string;
  availableFromPre: string; // "Available from the "
  availableFromPost: string; // " plan."
  howToUseCue: string; // "How to use it →"
  overview: string;
  whatYoullSee: string;
  controlsOptions: string;
  commonTasks: string;
  tips: string;
  howToUseHeading: string; // "How to use it"
  availabilityByPlan: string;
  backAllHelp: string; // "← All Help"
  adminTag: string; // "Admin"
  footer: string;
  // Markdown (stored doc) chrome
  mdIntro: string;
  mdPlansHeading: string;
  mdColUsers: string;
  mdColPrice: string;
  mdColBestFor: string;
  mdColFeature: string;
  mdAdminTag: string; // "(ADMIN)"
}

export const HELP_UI: Record<HelpLocale, HelpUi> = {
  'en-US': {
    htmlLang: 'en', pageTitle: 'wxKanban Help — features by plan',
    h1: 'Help — what each plan includes',
    lede: "Every wxKanban area, what it does, and whether it's included on each plan. Pick a plan to see what's available and what an upgrade unlocks — or open any feature for step-by-step help.",
    legendIncluded: 'Included', legendUpgrade: 'Upgrade required',
    included: 'Included', notIncluded: 'Not included',
    availableFromPre: 'Available from the ', availableFromPost: ' plan.',
    howToUseCue: 'How to use it →', overview: 'Overview', whatYoullSee: "What you'll see",
    controlsOptions: 'Controls & options', commonTasks: 'Common tasks', tips: 'Tips',
    howToUseHeading: 'How to use it', availabilityByPlan: 'Availability by plan',
    backAllHelp: '← All Help', adminTag: 'Admin', footer: 'wxKanban Help',
    mdIntro: 'What every wxKanban area does, and which subscription plan includes it. **✓** = included on that plan; **—** = not included (upgrade to the first plan where it shows ✓).',
    mdPlansHeading: 'Plans', mdColUsers: 'Users', mdColPrice: 'Price', mdColBestFor: 'Best for', mdColFeature: 'Feature', mdAdminTag: '(ADMIN)',
  },
  'fr-FR': {
    htmlLang: 'fr', pageTitle: 'Aide wxKanban — fonctionnalités par forfait',
    h1: 'Aide — ce que chaque forfait inclut',
    lede: "Chaque espace de wxKanban, ce qu'il fait et s'il est inclus dans chaque forfait. Choisissez un forfait pour voir ce qui est disponible et ce qu'une mise à niveau débloque — ou ouvrez une fonctionnalité pour une aide pas à pas.",
    legendIncluded: 'Inclus', legendUpgrade: 'Mise à niveau requise',
    included: 'Inclus', notIncluded: 'Non inclus',
    availableFromPre: 'Disponible à partir du forfait ', availableFromPost: '.',
    howToUseCue: "Comment l'utiliser →", overview: 'Aperçu', whatYoullSee: 'Ce que vous verrez',
    controlsOptions: 'Commandes et options', commonTasks: 'Tâches courantes', tips: 'Conseils',
    howToUseHeading: "Comment l'utiliser", availabilityByPlan: 'Disponibilité par forfait',
    backAllHelp: '← Toute l’aide', adminTag: 'Admin', footer: 'Aide wxKanban',
    mdIntro: 'Ce que fait chaque espace de wxKanban, et quel forfait d’abonnement l’inclut. **✓** = inclus dans ce forfait ; **—** = non inclus (passez au premier forfait où ✓ apparaît).',
    mdPlansHeading: 'Forfaits', mdColUsers: 'Utilisateurs', mdColPrice: 'Prix', mdColBestFor: 'Idéal pour', mdColFeature: 'Fonctionnalité', mdAdminTag: '(ADMIN)',
  },
  'es-ES': {
    htmlLang: 'es', pageTitle: 'Ayuda de wxKanban — funciones por plan',
    h1: 'Ayuda — lo que incluye cada plan',
    lede: 'Cada área de wxKanban, qué hace y si está incluida en cada plan. Elige un plan para ver qué está disponible y qué desbloquea una mejora, o abre cualquier función para obtener ayuda paso a paso.',
    legendIncluded: 'Incluido', legendUpgrade: 'Requiere mejora',
    included: 'Incluido', notIncluded: 'No incluido',
    availableFromPre: 'Disponible desde el plan ', availableFromPost: '.',
    howToUseCue: 'Cómo usarlo →', overview: 'Resumen', whatYoullSee: 'Lo que verás',
    controlsOptions: 'Controles y opciones', commonTasks: 'Tareas comunes', tips: 'Consejos',
    howToUseHeading: 'Cómo usarlo', availabilityByPlan: 'Disponibilidad por plan',
    backAllHelp: '← Toda la ayuda', adminTag: 'Admin', footer: 'Ayuda de wxKanban',
    mdIntro: 'Qué hace cada área de wxKanban y qué plan de suscripción la incluye. **✓** = incluido en ese plan; **—** = no incluido (mejora al primer plan donde aparece ✓).',
    mdPlansHeading: 'Planes', mdColUsers: 'Usuarios', mdColPrice: 'Precio', mdColBestFor: 'Ideal para', mdColFeature: 'Función', mdAdminTag: '(ADMIN)',
  },
  'it-IT': {
    htmlLang: 'it', pageTitle: 'Guida wxKanban — funzionalità per piano',
    h1: 'Guida — cosa include ogni piano',
    lede: 'Ogni area di wxKanban, cosa fa e se è inclusa in ciascun piano. Scegli un piano per vedere cosa è disponibile e cosa sblocca un upgrade, oppure apri una funzionalità per una guida passo passo.',
    legendIncluded: 'Incluso', legendUpgrade: 'Upgrade richiesto',
    included: 'Incluso', notIncluded: 'Non incluso',
    availableFromPre: 'Disponibile dal piano ', availableFromPost: '.',
    howToUseCue: 'Come usarlo →', overview: 'Panoramica', whatYoullSee: 'Cosa vedrai',
    controlsOptions: 'Comandi e opzioni', commonTasks: 'Attività comuni', tips: 'Suggerimenti',
    howToUseHeading: 'Come usarlo', availabilityByPlan: 'Disponibilità per piano',
    backAllHelp: '← Tutta la guida', adminTag: 'Admin', footer: 'Guida wxKanban',
    mdIntro: 'Cosa fa ogni area di wxKanban e quale piano di abbonamento la include. **✓** = incluso in quel piano; **—** = non incluso (passa al primo piano in cui compare ✓).',
    mdPlansHeading: 'Piani', mdColUsers: 'Utenti', mdColPrice: 'Prezzo', mdColBestFor: 'Ideale per', mdColFeature: 'Funzionalità', mdAdminTag: '(ADMIN)',
  },
  'de-DE': {
    htmlLang: 'de', pageTitle: 'wxKanban-Hilfe — Funktionen nach Tarif',
    h1: 'Hilfe — was jeder Tarif enthält',
    lede: 'Jeder Bereich von wxKanban, was er tut und ob er in jedem Tarif enthalten ist. Wählen Sie einen Tarif, um zu sehen, was verfügbar ist und was ein Upgrade freischaltet — oder öffnen Sie eine Funktion für eine Schritt-für-Schritt-Hilfe.',
    legendIncluded: 'Enthalten', legendUpgrade: 'Upgrade erforderlich',
    included: 'Enthalten', notIncluded: 'Nicht enthalten',
    availableFromPre: 'Verfügbar ab dem Tarif ', availableFromPost: '.',
    howToUseCue: 'So verwenden Sie es →', overview: 'Überblick', whatYoullSee: 'Was Sie sehen',
    controlsOptions: 'Steuerelemente & Optionen', commonTasks: 'Häufige Aufgaben', tips: 'Tipps',
    howToUseHeading: 'So verwenden Sie es', availabilityByPlan: 'Verfügbarkeit nach Tarif',
    backAllHelp: '← Gesamte Hilfe', adminTag: 'Admin', footer: 'wxKanban-Hilfe',
    mdIntro: 'Was jeder Bereich von wxKanban tut und welcher Abonnement-Tarif ihn enthält. **✓** = im Tarif enthalten; **—** = nicht enthalten (Upgrade auf den ersten Tarif, in dem ✓ erscheint).',
    mdPlansHeading: 'Tarife', mdColUsers: 'Nutzer', mdColPrice: 'Preis', mdColBestFor: 'Ideal für', mdColFeature: 'Funktion', mdAdminTag: '(ADMIN)',
  },
  'pt-BR': {
    htmlLang: 'pt', pageTitle: 'Ajuda do wxKanban — recursos por plano',
    h1: 'Ajuda — o que cada plano inclui',
    lede: 'Cada área do wxKanban, o que ela faz e se está incluída em cada plano. Escolha um plano para ver o que está disponível e o que um upgrade desbloqueia — ou abra qualquer recurso para obter ajuda passo a passo.',
    legendIncluded: 'Incluído', legendUpgrade: 'Upgrade necessário',
    included: 'Incluído', notIncluded: 'Não incluído',
    availableFromPre: 'Disponível a partir do plano ', availableFromPost: '.',
    howToUseCue: 'Como usar →', overview: 'Visão geral', whatYoullSee: 'O que você verá',
    controlsOptions: 'Controles e opções', commonTasks: 'Tarefas comuns', tips: 'Dicas',
    howToUseHeading: 'Como usar', availabilityByPlan: 'Disponibilidade por plano',
    backAllHelp: '← Toda a ajuda', adminTag: 'Admin', footer: 'Ajuda do wxKanban',
    mdIntro: 'O que cada área do wxKanban faz e qual plano de assinatura a inclui. **✓** = incluído nesse plano; **—** = não incluído (faça upgrade para o primeiro plano onde aparece ✓).',
    mdPlansHeading: 'Planos', mdColUsers: 'Usuários', mdColPrice: 'Preço', mdColBestFor: 'Ideal para', mdColFeature: 'Recurso', mdAdminTag: '(ADMIN)',
  },
};
