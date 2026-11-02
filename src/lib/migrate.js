import { checkinKey } from './streaks.js';

/**
 * Moving to local-only: true only when the phone's saved copy holds every row that was pulled
 * from the cloud. The cloud copy is deleted only after this passes.
 */
export function localCopyComplete(legacy, snapshot) {
  if (!legacy || !snapshot) return false;
  const has = (map, key) => Boolean(map && map[key]);
  return (
    (legacy.goals || []).every((r) => has(snapshot.goals, r.id)) &&
    (legacy.checkins || []).every((r) => has(snapshot.checkins, checkinKey(r.goal_id, r.day))) &&
    (legacy.day_notes || []).every((r) => has(snapshot.notes, r.day)) &&
    (legacy.achievements || []).every((r) => has(snapshot.achievements, r.award_key)) &&
    (legacy.challenges || []).every((r) => has(snapshot.challenges, r.month))
  );
}
