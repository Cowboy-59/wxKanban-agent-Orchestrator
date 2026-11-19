// Ask Gate classifier (SPEC-142 FR-009).
//
// A question the Decision Ledger does not answer is either a BLOCKER (a person must decide)
// or an ASSUMPTION (the agent picks the most reasonable default and continues). The rule is
// deterministic keyword matching, and it fails closed: anything that touches security,
// client data, money, legal or compliance, an irreversible action, or a conflict with the
// spec or ledger is a blocker; so is anything empty, unparseable or too vague to judge.
// In conversion mode a question about how the legacy app behaves is a blocker too, because
// the evidence for it is missing (that is why it was asked).
//
//   classify(question, opts)  -> 'blocker' | 'assumption'
//   explain(question, opts)   -> { class, reasons: [ { rule, match } ] }
//
// opts: { conversion?: boolean, context?: [ { id, score, text } ], threshold?: number }
//   context entries (ledger items the search returned that may not answer) scoring at least
//   RELATED_FRACTION of the threshold mean the owner has said something on this subject; a blocker.

const w = (s) => new RegExp(`\\b(?:${s})\\b`, 'i');

export const RULES = [
  {
    rule: 'security',
    re: [
      w('passwords?|passphrases?|secrets?|credentials?|api[ -]?keys?|access[ -]?keys?|private[ -]?keys?|tokens?'),
      w('auth|authenticat\\w*|authori[sz]\\w*|log[ -]?in|sign[ -]?in|sso|oauth|jwt|sessions? cookies?|rbac|roles?|privileges?|permissions?|access control'),
      w('encrypt\\w*|decrypt\\w*|ssl|tls|https|certificates?|cors|csrf|xss|injection|sanitiz\\w*|vulnerab\\w*|cves?|exploit\\w*|firewall|sudo|root access'),
      w('no-verify|bypass\\w*|(?:skip\\w*|disabl\\w*|turn\\w* off|switch\\w* off) (?:the |a |all )?(?:[\\w-]+ )?(?:hooks?|checks?|validation|tests?|auth\\w*|security|lint\\w*|gates?|guards?)'),
      /(^|[\s"'`(])\.env\b/i,
    ],
  },
  {
    rule: 'client-data',
    re: [
      w('pii|personal (?:data|information|details)|personally identifiable|gdpr|ccpa'),
      w('(?:customer|client|user|patient|member|subscriber|contact)s?\'? (?:data|records?|rows?|details|information|emails?|list|accounts?|files?|uploads?)'),
      w('production data|prod data|real data|live data|real (?:customers?|users?)|marketingcontacts'),
      w('e-?mail addresses?|phone numbers?|home address\\w*|date of birth|dob|ssn|social security|credit cards?|card numbers?|bank accounts?|medical|health records?'),
      w('anonymi[sz]\\w*|pseudonymi[sz]\\w*|redact\\w*|mask(?:ing)? (?:the )?(?:data|pii|fields?)'),
      w('send (?:an? )?(?:e-?mails?|sms|texts?|notifications?|messages?) to (?:the )?(?:customers?|clients?|users?|contacts?|everyone|all)'),
    ],
  },
  {
    rule: 'money',
    re: [
      w('price|prices|pricing|priced|costs?|costing|billing|billed|invoices?|invoicing|payments?|payouts?|charges?|charging|refunds?|fees?|discounts?|coupons?|tax|taxes|vat'),
      w('subscriptions?|stripe|paypal|checkout|purchas\\w*|revenue|budgets?|spend\\w*|paid|unpaid|free tier|trial|price quotes?|currency|currencies'),
      /[$€£]\s?\d/,
    ],
  },
  {
    rule: 'legal-compliance',
    re: [
      w('licen[cs]e[sd]?|licensing|gpl|agpl|lgpl|copyright\\w*|trademarks?|patents?|attribution'),
      w('legal\\w*|lawyers?|compliance|compliant|soc ?2|hipaa|pci(?:-dss)?|iso ?27001|regulat\\w*|audit\\w*'),
      w('terms of (?:service|use)|tos|privacy policy|contracts?|consent|data retention|retention period|opt[ -]?in|opt[ -]?out|unsubscribe'),
    ],
  },
  {
    rule: 'irreversible',
    re: [
      w('delete\\w*|deletion|drop(?:s|ped|ping)?|truncat\\w*|purg\\w*|wip(?:e|es|ed|ing)|eras\\w*|destroy\\w*|overwrit\\w*|irreversibl\\w*|permanent\\w*|cannot be undone|can\'t be undone'),
      w('remov\\w* (?:the |all |every |these |those |this |that )?(?:old |existing |unused |stale )?(?:tables?|columns?|rows?|records?|data|files?|folders?|director\\w*|branch\\w*|users?|accounts?|history|backups?)'),
      w('push\\w*|force[ -]push|deploy\\w*|releas\\w*|publish\\w*|ship (?:it|this|to)|go live|production|prod|main branch|merge (?:it |this )?(?:in)?to main'),
      w('migrat\\w*|schema|ddl|alter table|add (?:a )?column|rename (?:the )?(?:table|column)|foreign keys?|rollback|roll back|reset --hard|rebase|rewrite (?:the )?history|rm -rf'),
    ],
  },
  {
    rule: 'conflict',
    re: [
      w('conflicts?|conflicting|contradict\\w*|inconsistent|discrepan\\w*|mismatch\\w*|differs? from|deviat\\w*'),
      w('(?:the )?spec (?:says|said|requires|states)|ledger (?:says|said)|against the spec|not in the spec|outside (?:the )?scope|out of scope'),
      w('overrid\\w*|supersed\\w*|go against|instead of what (?:was|we) (?:agreed|decided)|change (?:the|an?) (?:agreed|approved|earlier) decision|you (?:said|decided) earlier|earlier decision'),
    ],
  },
];

/** Conversion mode only: the question is about how the legacy app behaves. */
export const CONVERSION_RULE = {
  rule: 'conversion-legacy-evidence',
  re: [
    w('legacy|original (?:app|application|system|code|screen|form|window|report)|old (?:app|application|system|screen|version)|existing (?:app|behaviou?r|system)'),
    w('windev|webdev|pcsoft|wlanguage|vb6|visual basic|clarion|delphi|foxpro|access database'),
    w('business rules?|how (?:did|does) (?:it|the (?:old|original|legacy) \\w+) (?:work|behave|handle|calculate|validate)'),
    w('behaviou?r is (?:unclear|unknown|ambiguous)|not (?:in|clear from) the (?:source|pdf|documentation|export)|no evidence'),
  ],
};

/**
 * Approval-seeking with nothing else to go on: the agent itself thinks a person must say go.
 * A keyword classifier cannot tell a safe "proceed?" from a dangerous one, so it is a blocker.
 */
// The owner's own choice is approval too (found live, wxBrainstorm close: "record it, or change the
// summary first?" was assumed and the agent recorded an unapproved summary).
const APPROVAL = w('(?:shall|should|may|can) i (?:go ahead|proceed|continue|start|record|commit|apply)|ok(?:ay)? to (?:proceed|continue|go ahead)|(?:(?:do )?you )?want me to|would you like me to|what would you like (?:me )?to do|look(?:s)? right to you|shall i|is (?:it|this) (?:ok|okay|alright|fine) (?:if|to)|(?:please )?(?:approve|confirm)\\b|approv\\w*|sign[ -]?off|go-ahead|record (?:it|this|the (?:summary|record|decisions?))|(?:change|edit|fix|accept|reject) the summary|your (?:call|decision|choice|approval|sign-off)');

const MIN_WORDS = 3;
/** A context entry scoring at least this share of the match threshold counts as related. */
export const RELATED_FRACTION = 0.5;

/** Normalize anything the hooks hand us into one string, or null when it cannot be read. */
// [SCOPE 142 / T007] BEGIN — Keyword classifier and the 30-question labelled test set (F…
export function questionText(question) {
  if (typeof question === 'string') return question.trim() || null;
  if (question && typeof question === 'object') {
    const parts = [question.question, question.header, ...(Array.isArray(question.options) ? question.options.map((o) => [o?.label, o?.description].filter(Boolean).join(' ')) : [])];
    const text = parts.filter((p) => typeof p === 'string' && p.trim()).join(' \n ').trim();
    return text || null;
  }
  return null;
}
// [SCOPE 142 / T007] END

// [SCOPE 142 / T007] BEGIN — Keyword classifier and the 30-question labelled test set (F…
export function explain(question, opts = {}) {
// [SCOPE 142 / T007] END
  const text = questionText(question);
  const reasons = [];
  if (!text) return { class: 'blocker', reasons: [{ rule: 'unsure', match: 'empty or unparseable question' }] };

  const words = text.split(/\s+/).filter((t) => /[a-z0-9]/i.test(t));
  if (words.length < MIN_WORDS) reasons.push({ rule: 'unsure', match: `too short to judge (${words.length} word${words.length === 1 ? '' : 's'})` });

  const rules = opts.conversion ? [...RULES, CONVERSION_RULE] : RULES;
  for (const { rule, re } of rules) {
    for (const r of re) {
      const m = text.match(r);
      if (m) {
        reasons.push({ rule, match: m[0].trim() });
        break;
      }
    }
  }
  const approval = text.match(APPROVAL);
  if (approval) reasons.push({ rule: 'unsure', match: `asks for approval: "${approval[0].trim()}"` });

  // The ledger already touches this subject: an open item (evidence unknown, parked, declined) at
  // any answer-level score, or a decision that matched only partly (at least half the threshold).
  // Either way the owner has said something here, so the agent must not pick its own default.
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : 0;
  for (const c of Array.isArray(opts.context) ? opts.context : []) {
    if (typeof c?.score === 'number' && c.score >= threshold * RELATED_FRACTION) {
      reasons.push({ rule: 'conflict', match: `the ledger holds a related item (${c.id ?? 'no id'}, score ${c.score.toFixed(2)}); the owner should confirm` });
      break;
    }
  }
  return { class: reasons.length ? 'blocker' : 'assumption', reasons };
}

// [SCOPE 142 / T007] BEGIN — Keyword classifier and the 30-question labelled test set (F…
export function classify(question, opts = {}) {
// [SCOPE 142 / T007] END
  try {
    return explain(question, opts).class;
  } catch {
    return 'blocker';
  }
}
