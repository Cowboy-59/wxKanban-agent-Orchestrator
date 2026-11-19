// [SCOPE 064 / T014] BEGIN — shared newsletter recipient-segment definitions
/**
 * Shared source of truth for newsletter recipient "segments" so the client picker
 * (Newsletter.tsx) and the server resolver (NewsletterSendService) cannot drift.
 *
 * A segment value normally maps 1:1 to a `marketingcontacts.signuplist` string.
 * A VIRTUAL segment is a reserved sentinel that does NOT correspond to a signuplist
 * value — instead the resolver switches to a different WHERE clause. See FR-014:
 * "Hands-on" targets the orthogonal boolean cohort `wantshandson = true`, which can
 * never be expressed as a signuplist string.
 */

/** Reserved sentinel for the "wants hands-on help" cohort (marketingcontacts.wantshandson). */
export const HANDS_ON_SEGMENT = 'hands-on';

export interface VirtualSegment {
  /** The value persisted in newsletterissues.segment and sent to the API. */
  value: string;
  /** Human label shown in the picker. */
  label: string;
  /** One-line hint describing who it targets. */
  hint: string;
}

/**
 * Virtual segments offered in the picker in addition to raw signuplist values.
 * Keep values distinct from any real signuplist string (a plain signuplist send
 * must be unaffected).
 */
export const VIRTUAL_SEGMENTS: VirtualSegment[] = [
  {
    value: HANDS_ON_SEGMENT,
    label: 'Hands-on',
    hint: 'Contacts who asked for hands-on help (wantshandson = true), across all lists.',
  },
];

/** True when `segment` is a reserved virtual sentinel, not a real signuplist value. */
export function isVirtualSegment(segment: string): boolean {
  return VIRTUAL_SEGMENTS.some((s) => s.value === segment);
}
// [SCOPE 064 / T014] END
