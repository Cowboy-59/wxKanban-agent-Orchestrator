/**
 * Signup-invitation email copy, per language.
 * Spec 023 FR-002a.2 (T116).
 *
 * Hand-authored rather than machine-translated at send time, deliberately:
 * this is fixed boilerplate that represents wxKanban to a prospect, so it must
 * read identically for every recipient in a language, cost nothing to send, and
 * never depend on a model being up. Only the administrator's own free-text
 * message is machine-translated (and always reviewed first).
 *
 * Wording mirrors the registration promo copy in src/client/i18n/locales/*.ts
 * (register.promo*) so the email and the page a prospect lands on agree.
 *
 * The locale set tracks MarketingAIService.TRANSLATION_LOCALES + en-US.
 */

export const INVITE_EMAIL_LOCALES = [
  "en-US",
  "fr-FR",
  "de-DE",
  "es-ES",
  "it-IT",
  "pt-BR",
] as const;

export type InviteEmailLocale = (typeof INVITE_EMAIL_LOCALES)[number];

/** Language names shown in the SysAdmin picker, each in its own language. */
export const INVITE_EMAIL_LANGUAGE_LABELS: Record<InviteEmailLocale, string> = {
  "en-US": "English",
  "fr-FR": "Français",
  "de-DE": "Deutsch",
  "es-ES": "Español",
  "it-IT": "Italiano",
  "pt-BR": "Português (Brasil)",
};

export interface InviteEmailStrings {
  /** Default subject. {{days}} */
  subject: string;
  heading: string;
  greeting: string;
  /** {{plan}} {{days}} */
  intro: string;
  /** {{days}} */
  freeFor: string;
  /** {{price}} */
  thenPrice: string;
  cardNote: string;
  cta: string;
  /** {{email}} {{date}} */
  boundAndExpires: string;
  fallbackLink: string;
  footerTagline: string;
  footerRights: string;
}

export const INVITE_EMAIL_STRINGS: Record<InviteEmailLocale, InviteEmailStrings> = {
  "en-US": {
    subject: "You're invited to wxKanban — {{days}} days free",
    heading: "You're invited to wxKanban",
    greeting: "Hello,",
    intro:
      "You've been invited to try <strong>wxKanban</strong> on the <strong>{{plan}}</strong> plan, with your first <strong>{{days}} days free</strong>.",
    freeFor: "Free for {{days}} days",
    thenPrice: "Then {{price}}/month.",
    cardNote:
      "We'll ask for a card so your account continues automatically when the free period ends. You will not be charged today.",
    cta: "Start your free period",
    boundAndExpires:
      "This invitation is for <strong>{{email}}</strong> and can only be used once. It expires on {{date}}.",
    fallbackLink: "If the button doesn't work, paste this into your browser:",
    footerTagline: "wxKanban • Project Management with AI",
    footerRights: "© 2026 wxKanban. All rights reserved.",
  },

  "fr-FR": {
    subject: "Vous êtes invité à wxKanban — {{days}} jours gratuits",
    heading: "Vous êtes invité à wxKanban",
    greeting: "Bonjour,",
    intro:
      "Vous êtes invité à essayer <strong>wxKanban</strong> avec l'offre <strong>{{plan}}</strong>, vos <strong>{{days}} premiers jours gratuits</strong>.",
    freeFor: "Gratuit pendant {{days}} jours",
    thenPrice: "Puis {{price}}/mois.",
    cardNote:
      "Nous vous demanderons une carte afin que votre compte se poursuive automatiquement à la fin de la période gratuite. Vous ne serez pas débité aujourd'hui.",
    cta: "Démarrer la période gratuite",
    boundAndExpires:
      "Cette invitation est destinée à <strong>{{email}}</strong> et ne peut être utilisée qu'une seule fois. Elle expire le {{date}}.",
    fallbackLink: "Si le bouton ne fonctionne pas, collez ceci dans votre navigateur :",
    footerTagline: "wxKanban • Gestion de projet avec l'IA",
    footerRights: "© 2026 wxKanban. Tous droits réservés.",
  },

  "de-DE": {
    subject: "Sie sind zu wxKanban eingeladen — {{days}} Tage kostenlos",
    heading: "Sie sind zu wxKanban eingeladen",
    greeting: "Hallo,",
    intro:
      "Sie sind eingeladen, <strong>wxKanban</strong> im Tarif <strong>{{plan}}</strong> zu testen — Ihre ersten <strong>{{days}} Tage kostenlos</strong>.",
    freeFor: "{{days}} Tage kostenlos",
    thenPrice: "Danach {{price}}/Monat.",
    cardNote:
      "Wir fragen nach einer Karte, damit Ihr Konto nach Ablauf des kostenlosen Zeitraums automatisch weiterläuft. Heute wird nichts belastet.",
    cta: "Kostenlosen Zeitraum starten",
    boundAndExpires:
      "Diese Einladung gilt für <strong>{{email}}</strong> und kann nur einmal verwendet werden. Sie läuft am {{date}} ab.",
    fallbackLink: "Falls die Schaltfläche nicht funktioniert, fügen Sie dies in Ihren Browser ein:",
    footerTagline: "wxKanban • Projektmanagement mit KI",
    footerRights: "© 2026 wxKanban. Alle Rechte vorbehalten.",
  },

  "es-ES": {
    subject: "Te invitamos a wxKanban — {{days}} días gratis",
    heading: "Te invitamos a wxKanban",
    greeting: "Hola:",
    intro:
      "Te han invitado a probar <strong>wxKanban</strong> con el plan <strong>{{plan}}</strong>, con tus primeros <strong>{{days}} días gratis</strong>.",
    freeFor: "Gratis durante {{days}} días",
    thenPrice: "Después, {{price}}/mes.",
    cardNote:
      "Te pediremos una tarjeta para que tu cuenta continúe automáticamente cuando termine el periodo gratuito. Hoy no se te cobrará nada.",
    cta: "Empezar el periodo gratuito",
    boundAndExpires:
      "Esta invitación es para <strong>{{email}}</strong> y solo puede usarse una vez. Caduca el {{date}}.",
    fallbackLink: "Si el botón no funciona, pega esto en tu navegador:",
    footerTagline: "wxKanban • Gestión de proyectos con IA",
    footerRights: "© 2026 wxKanban. Todos los derechos reservados.",
  },

  "it-IT": {
    subject: "Sei invitato su wxKanban — {{days}} giorni gratis",
    heading: "Sei invitato su wxKanban",
    greeting: "Ciao,",
    intro:
      "Sei stato invitato a provare <strong>wxKanban</strong> con il piano <strong>{{plan}}</strong>, con i tuoi primi <strong>{{days}} giorni gratuiti</strong>.",
    freeFor: "Gratis per {{days}} giorni",
    thenPrice: "Poi {{price}}/mese.",
    cardNote:
      "Ti chiederemo una carta così il tuo account prosegue automaticamente alla fine del periodo gratuito. Oggi non ti verrà addebitato nulla.",
    cta: "Inizia il periodo gratuito",
    boundAndExpires:
      "Questo invito è per <strong>{{email}}</strong> e può essere usato una sola volta. Scade il {{date}}.",
    fallbackLink: "Se il pulsante non funziona, incolla questo nel browser:",
    footerTagline: "wxKanban • Project management con l'IA",
    footerRights: "© 2026 wxKanban. Tutti i diritti riservati.",
  },

  "pt-BR": {
    subject: "Você foi convidado para o wxKanban — {{days}} dias grátis",
    heading: "Você foi convidado para o wxKanban",
    greeting: "Olá,",
    intro:
      "Você foi convidado a experimentar o <strong>wxKanban</strong> no plano <strong>{{plan}}</strong>, com seus primeiros <strong>{{days}} dias grátis</strong>.",
    freeFor: "Grátis por {{days}} dias",
    thenPrice: "Depois, {{price}}/mês.",
    cardNote:
      "Vamos pedir um cartão para que sua conta continue automaticamente quando o período gratuito terminar. Você não será cobrado hoje.",
    cta: "Começar o período gratuito",
    boundAndExpires:
      "Este convite é para <strong>{{email}}</strong> e só pode ser usado uma vez. Ele expira em {{date}}.",
    fallbackLink: "Se o botão não funcionar, cole isto no seu navegador:",
    footerTagline: "wxKanban • Gestão de projetos com IA",
    footerRights: "© 2026 wxKanban. Todos os direitos reservados.",
  },
};

/** Unknown/unsupported locale falls back to English rather than throwing. */
export function inviteStringsFor(locale: string | null | undefined): InviteEmailStrings {
  return (
    INVITE_EMAIL_STRINGS[locale as InviteEmailLocale] ?? INVITE_EMAIL_STRINGS["en-US"]
  );
}

export function isInviteEmailLocale(v: string): v is InviteEmailLocale {
  return (INVITE_EMAIL_LOCALES as readonly string[]).includes(v);
}

/** Fill {{placeholders}}. */
export function fillInvite(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) =>
    k in vars ? String(vars[k]) : `{{${k}}}`,
  );
}
