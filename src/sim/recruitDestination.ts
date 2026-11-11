/** Where a player recruit is put. The Game Options screen owns the value. AI crews are unchanged. */
export type RecruitJoin = 'pool' | 'crew';

let join: RecruitJoin = 'pool';

export function recruitJoin(): RecruitJoin {
  return join;
}

export function setRecruitJoin(next: RecruitJoin): void {
  join = next === 'crew' ? 'crew' : 'pool';
}
