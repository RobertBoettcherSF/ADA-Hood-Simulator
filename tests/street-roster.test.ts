import { beforeAll, describe, expect, it } from 'vitest';
import { defaultGameOptions } from '../src/app/newGame';
import { streetRoster } from '../src/app/streetRoster';
import { issueOrder, issueStreetOrder } from '../src/sim/api';
import { clearDestination } from '../src/sim/movement';
import { Sim } from '../src/sim/sim';
import type { WorldState } from '../src/sim/types';

let initial:string;
beforeAll(()=>{initial=JSON.stringify(new Sim({...defaultGameOptions(),seed:404,citySize:10,startHoods:5}).world);});
function scene() {
  const sim=Sim.fromSave(JSON.parse(initial) as WorldState), w=sim.world, gang=sim.playerGang;
  const team=w.teams[gang.teamIds[0]], boss=w.people[gang.bossId], lt=w.people[team.lieutenantId];
  const manager=Object.values(w.people).find(p=>p.gangId===gang.id && p.role==='hood' && p.buildingId!=null)!;
  return {sim,w,gang,team,boss,lt,manager};
}
function deployOne() {
  const s=scene(), hood=s.w.people[s.team.memberIds[0]];
  expect(issueOrder(s.w,s.gang.id,{teamId:s.team.id,type:'patrol',blockIds:[0],
    opts:{manpower:1,preferredHoodId:hood.id}}).ok).toBe(true);
  s.sim.launchWeek();
  return {...s,hood};
}

describe('street roster counts people, not crew portraits or the whole gang',()=>{
  // 1.2.21: five hoods plus the lieutenant — three reserves now.
  it('starts with a two-person crew, three reserves, one front manager and a separate boss',()=>{
    const {w,gang,team,manager}=scene();
    expect(gang.teamIds).toHaveLength(1); expect(team.memberIds).toHaveLength(1);
    expect(gang.poolIds).toHaveLength(3);
    expect(manager.teamId).toBeNull();
    expect(Object.values(w.people).filter(p=>p.gangId===gang.id && p.role!=='boss')).toHaveLength(6);
    expect(streetRoster(w,gang)).toEqual({count:0,groups:[]});
  });

  it('shows exactly one hood when only one is sent out for the week',()=>{
    const {w,gang,team,hood,boss,manager,lt}=deployOne(), roster=streetRoster(w,gang);
    expect(roster.count).toBe(1); expect(roster.groups).toHaveLength(1);
    expect(roster.groups[0].people.map(p=>p.id)).toEqual([hood.id]);
    expect(roster.groups[0].crewSize).toBe(2); expect(roster.groups[0].team?.id).toBe(team.id);
    expect(roster.groups[0].people).not.toEqual(expect.arrayContaining([boss,manager,lt]));
  });

  it('shows deployed crew members once, with the lieutenant first and reserves excluded',()=>{
    const {w,gang,team,lt}=scene(), hood=w.people[team.memberIds[0]];
    for(const p of [hood,lt])expect(issueStreetOrder(w,gang.id,[p.id],'goTo',null,{x:20,y:5.4}).ok).toBe(true);
    const roster=streetRoster(w,gang);
    expect(roster.count).toBe(2);expect(roster.groups[0].people.map(p=>p.id)).toEqual([lt.id,hood.id]);
    const saved=Sim.fromSave(JSON.parse(JSON.stringify(w)) as WorldState);
    expect(streetRoster(saved.world,saved.playerGang).groups[0].people.map(p=>p.id)).toEqual([lt.id,hood.id]);
  });

  it('never counts the boss or an indoor manager with an old car flag',()=>{
    const {w,gang,boss,manager}=deployOne();
    boss.dest={x:20,y:5.4};boss.inVehicle=true;manager.inVehicle=true;
    expect(streetRoster(w,gang).count).toBe(1);
  });

  it('removes finished phantom jobs from the count while keeping a real return journey',()=>{
    const {w,gang,hood}=deployOne();
    w.orders[hood.orderId!].state='done';clearDestination(hood);hood.inVehicle=false;
    expect(streetRoster(w,gang).count).toBe(0);
    hood.dest={x:20,y:5.4};
    expect(streetRoster(w,gang).count).toBe(1);
  });

  it('does not add dead, jailed or enemy people to the player’s count',()=>{
    const {w,gang,hood}=deployOne();
    for(const status of ['dead','jailed','kidnapped'] as const) {
      hood.status=status; expect(streetRoster(w,gang).count).toBe(0);
    }
    hood.status='active';hood.gangId=Object.values(w.gangs).find(g=>g.id!==gang.id)!.id;
    expect(streetRoster(w,gang).count).toBe(0);
  });

  it('can watch a deployed specialist without adding them to a lieutenant’s crew',()=>{
    const {w,gang,team,hood}=deployOne();
    team.memberIds=team.memberIds.filter(id=>id!==hood.id);
    hood.teamId=null;hood.role='lawyer';gang.lawyerId=hood.id;hood.orderId=null;
    const roster=streetRoster(w,gang);
    expect(roster.count).toBe(1);expect(roster.groups[0].name).toBe('Specialists');
    expect(roster.groups[0].team).toBeNull();
  });

  it('is a read-only view: inspecting the roster never recruits or removes anyone',()=>{
    const {w,gang}=deployOne(), before=JSON.stringify(w);
    streetRoster(w,gang);streetRoster(w,gang);
    expect(JSON.stringify(w)).toBe(before);
  });
});
