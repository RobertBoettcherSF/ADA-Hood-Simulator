import { SKILL_LABELS, type Person, type Skill } from '../sim/types';

/** Five marks, matching the skill diamonds: a full star, a half, or an empty star. */
export function skillStars(value: number): string {
  let out = '';
  for (let i = 1; i <= 5; i++) {
    if (value >= i) out += '★';
    else if (value >= i - 0.5) out += '½';
    else out += '☆';
  }
  return out;
}

/** `Otto Weber ★★★☆☆ Business`, and both skills when the job uses two. */
export function preferredCrewLabel(person: Pick<Person, 'name' | 'skills'>, skills: readonly Skill[]): string {
  const marks = skills.map((skill) => `${skillStars(person.skills[skill])} ${SKILL_LABELS[skill]}`).join(' ');
  return marks ? `${person.name} ${marks}` : person.name;
}

/** Highest relevant skill first. Equal totals keep the name order. */
export function preferredCrewOrder<T extends Pick<Person, 'name' | 'skills'>>(people: readonly T[], skills: readonly Skill[]): T[] {
  const score = (person: T) => skills.reduce((total, skill) => total + (person.skills[skill] ?? 0), 0);
  return [...people].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}
