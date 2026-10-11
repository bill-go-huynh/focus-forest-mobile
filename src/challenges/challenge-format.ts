import type { Challenge, ChallengeLists, ChallengeTemplate, ChallengeTerms } from '../api';
import { formatFocused } from '../history/history-format';

/**
 * Words for challenges (docs/02: cooperative, no pressure; never "failed"). Templates carry no
 * name: the app names them by what they ask, which is presentation only.
 */

const MINUTE = 60_000;

function hours(minutes: number): string {
  const value = minutes / 60;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} hours`;
}

export function challengeTitle(terms: ChallengeTerms): string {
  const together = terms.kind !== 'personal';
  switch (terms.measure) {
    case 'active_days':
      return `${terms.target} days of ${terms.dailyMinutes} min${together ? ', together' : ''}`;
    case 'focus_minutes':
      if (terms.goal === 'shared') return `${hours(terms.target)} as a team in ${terms.days} days`;
      return `${hours(terms.target)}${together ? ' each' : ''} in ${terms.days} days`;
    case 'sessions':
      if (terms.goal === 'shared') {
        return `${terms.target} sessions as a team in ${terms.days} days`;
      }
      return `${terms.target} sessions${together ? ' each' : ''} in ${terms.days} days`;
  }
}

export function kindLabel(kind: ChallengeTerms['kind']): string {
  return { personal: 'Just you', friend: 'With friends', group: 'Group' }[kind];
}

/** "With friends, up to 5". */
export function templateDetail(template: ChallengeTemplate): string {
  return template.kind === 'personal'
    ? kindLabel(template.kind)
    : `${kindLabel(template.kind)}, up to ${template.maxParticipants}`;
}

/** An amount in the template's unit: "4 days", "12 sessions", "6 h 40 min". */
function amount(terms: ChallengeTerms, value: number): string {
  switch (terms.measure) {
    case 'active_days':
      return `${value} ${value === 1 ? 'day' : 'days'}`;
    case 'sessions':
      return `${value} ${value === 1 ? 'session' : 'sessions'}`;
    case 'focus_minutes':
      return formatFocused(value * MINUTE);
  }
}

/** "4 of 7 days", "12 h 34 min of 50 h together". */
export function progressText(terms: ChallengeTerms, value: number, target: number): string {
  const together = terms.goal === 'shared' ? ' together' : '';
  switch (terms.measure) {
    case 'active_days':
      return `${value} of ${target} days${together}`;
    case 'sessions':
      return `${value} of ${target} sessions${together}`;
    case 'focus_minutes':
      return `${formatFocused(value * MINUTE)} of ${formatFocused(target * MINUTE)}${together}`;
  }
}

/** One participant: their part of a shared goal, or their progress toward their own. */
export function participantValue(terms: ChallengeTerms, value: number): string {
  return terms.goal === 'shared' ? amount(terms, value) : progressText(terms, value, terms.target);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (date: string) => {
  const [, month = 1, day = 1] = date.split('-').map(Number);
  return `${day} ${MONTHS[month - 1] ?? month}`;
};

/** "12 Oct – 18 Oct". */
export function windowText(challenge: Pick<Challenge, 'startDate' | 'endDate'>): string {
  return `${shortDate(challenge.startDate)} – ${shortDate(challenge.endDate)}`;
}

export function phaseText(
  challenge: Pick<Challenge, 'phase' | 'startDate' | 'endDate' | 'template'>,
): string {
  switch (challenge.phase) {
    case 'upcoming':
      return `Starts ${shortDate(challenge.startDate)}`;
    case 'active':
      return `Until ${shortDate(challenge.endDate)}`;
    case 'completed':
      return challenge.template.kind === 'personal' ? 'Completed' : 'Completed together';
    case 'ended':
      return 'Ended';
  }
}

/**
 * The one line Session Completion shows (docs/05): the first active challenge the user joined,
 * as the server derives it now. Null when there is none.
 */
export function completionChallengeLine(lists: ChallengeLists): string | null {
  // `current` holds the challenges the user joined; invitations come apart (A5.5).
  const challenge = lists.current.find((item) => item.phase === 'active');
  if (!challenge) return null;
  const { value, target } = challenge.progress;
  return `${challengeTitle(challenge.template)} · ${progressText(challenge.template, value, target)}`;
}
