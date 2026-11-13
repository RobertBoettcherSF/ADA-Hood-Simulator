import { artUrl } from '../app/artBase';
export interface BakedMotion {source:string;sha256:string;duration:number;styles:Record<string,{tracks:{name:string;times:number[];values:number[]}[]}>}
export interface WeaponMotions {fps:number;clips:Record<'pistolDraw'|'pistolDualDraw'|'rifleDraw'|'rifleHolster',BakedMotion>}
let pending:Promise<WeaponMotions>|undefined;
/** Share motion data across main view and Tagged windows without bloating app JS. */
export function loadWeaponMotions():Promise<WeaponMotions>{
  return pending??(pending=fetch(artUrl('art/city/sculpt/weapon-handling.json')).then(response=>{
    if(!response.ok)throw new Error(`Weapon animation load failed (${response.status})`);
    return response.json() as Promise<WeaponMotions>;
  }).catch(error=>{pending=undefined;throw error;}));
}
