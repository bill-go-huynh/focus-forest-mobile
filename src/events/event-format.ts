import type {
  ChallengeLists,
  EventCard,
  EventList,
  EventMilestone,
  EventMission,
  SessionEventResult,
} from '../api';
import { completionChallengeLine } from '../challenges/challenge-format';
import { formatFocused } from '../history/history-format';

/**
 * Words for events and the Community Tree (docs/02 Events: dates are information, never pressure;
 * Community Tree: a warm shared number, never a race). Presentation only.
 */

const MINUTE = 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "22 Oct", from an instant (UTC: the event's window is one instant for everyone). */
function shortDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ''}`;
}

/** "Starts 15 Oct", "Live until 22 Oct", or "Ended". */
export function phaseLine(event: { phase: string; startsAt: string; endsAt: string }): string {
  if (event.phase === 'upcoming') return `Starts ${shortDate(event.startsAt)}`;
  if (event.phase === 'live') return `Live until ${shortDate(event.endsAt)}`;
  return 'Ended';
}

/** "15 Oct – 22 Oct". */
export function windowLine(event: { startsAt: string; endsAt: string }): string {
  return `${shortDate(event.startsAt)} – ${shortDate(event.endsAt)}`;
}

/** Home's card, read as one button: "Autumn Study, 1 of 3 missions". */
export function cardLabel(card: EventCard): string {
  return card.joined && card.missionsCompleted !== null
    ? `${card.name}, ${card.missionsCompleted} of ${card.missionsTotal} missions`
    : `${card.name}, ${phaseLine(card)}`;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** A mission amount in its unit. */
function amount(measure: string, n: number): string {
  switch (measure) {
    case 'focus_minutes':
      return formatFocused(n * MINUTE);
    case 'active_days':
    case 'streak_days':
      return `${n} ${plural(n, 'day')}`;
    case 'sessions':
    case 'focus_together_sessions':
      return `${n} ${plural(n, 'session')}`;
    default:
      return String(n);
  }
}

/** "Focus 5 hours · 3 h of 5 h"; before joining, the target only. */
export function missionLine(mission: EventMission): string {
  if (mission.value === null) return `${mission.name} · ${amount(mission.measure, mission.target)}`;
  const target = amount(mission.measure, mission.target);
  const value =
    mission.measure === 'focus_minutes'
      ? formatFocused(mission.value * MINUTE)
      : String(mission.value);
  return `${mission.name} · ${value} of ${target}`;
}

/** "First leaf · Reached", or what it asks: "Full autumn · 2 missions". */
export function milestoneLine(milestone: EventMilestone): string {
  if (milestone.reached) return `${milestone.name} · Reached`;
  const n = milestone.requiredMissions;
  return `${milestone.name} · ${n} ${plural(n, 'mission')}`;
}

/** "Maple Lanterns, and a keepsake on your tree". */
export function rewardsLine(milestone: EventMilestone): string | null {
  const parts = [
    ...(milestone.rewards.badge ? [`The ${milestone.rewards.badge.name} badge`] : []),
    ...(milestone.rewards.cosmetic ? [milestone.rewards.cosmetic.name] : []),
    ...(milestone.rewards.traitId ? ['a keepsake on your tree'] : []),
  ];
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}

const STAGES: Record<string, string> = {
  seedling: 'Seedling',
  growing_tree: 'Growing Tree',
  bloom: 'Bloom',
  final_form: 'Final Form',
};

export function stageName(stage: string): string {
  return STAGES[stage] ?? stage;
}

/** "12,340". */
export function groupedNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Session Completion's one line (docs/05: mission or challenge progress): a mission this session
 * completed first, then the missions done in its event, then the challenge line. Null otherwise.
 */
export function completionLine(
  results: readonly SessionEventResult[] | null | undefined,
  events: EventList | null | undefined,
  challenges: ChallengeLists | null | undefined,
): string | null {
  for (const result of results ?? []) {
    const event = events?.items.find((item) => item.id === result.eventId);
    if (!event) continue;
    const completed = result.newlyCompletedMissionIds
      .map((id) => event.missions.find((mission) => mission.id === id))
      .find((mission) => mission !== undefined);
    if (completed) return `${event.name} · Mission complete: ${completed.name}`;
    const done = result.missions.filter((mission) => mission.completed).length;
    return `${event.name} · ${done} of ${result.missions.length} missions done`;
  }
  return challenges ? completionChallengeLine(challenges) : null;
}
