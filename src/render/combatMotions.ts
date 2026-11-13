import type {BakedMotion} from './weaponMotions';
import type {DailyMotionName} from './dailyMotion';
import { artUrl } from '../app/artBase';

/** Close-combat reactions and attacks. */
export type CloseMotionName='headBack'|'stomachHit'|'kneelDown'|'getUpKnees'|'knockDown'|'twitch'|'standUp'|'kick'|'swing';

export type CombatMotionName='idle'|'hit'|'hitPistol'|'hitRifle'|'death'|'burnDeath'|'strike'|'pistolShoot'|'pistolDualShoot'|'rifleShoot'|'tommyShoot';
export interface CombatMotions {fps:number;clips:Record<CombatMotionName,BakedMotion>&Partial<Record<DailyMotionName|CloseMotionName,BakedMotion>>}
let pending:Promise<CombatMotions>|undefined;
export function loadCombatMotions():Promise<CombatMotions>{
  // Daily clips (running, gestures) share the combat clips' format and styles.
  return pending??(pending=Promise.all(['combat','burning','daily','close'].map(name=>fetch(artUrl(`art/city/sculpt/${name}-motions.json`)).then(response=>{
    if(!response.ok)throw new Error(`Combat animation load failed (${response.status})`);
    return response.json() as Promise<CombatMotions>;
  }))).then(([combat,burning,daily,close])=>({fps:combat.fps,clips:{...combat.clips,...burning.clips,...daily.clips,...close.clips}})).catch(error=>{pending=undefined;throw error;}));
}
