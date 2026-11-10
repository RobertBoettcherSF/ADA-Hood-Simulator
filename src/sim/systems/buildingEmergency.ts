import {blockRect} from '../cityLayout';
import {createPerson} from '../citygen';
import {addMessage,recordCrime} from '../events';
import {killPerson} from '../execution';
import {clearDestination,setDestination,stepPerson} from '../movement';
import {presentPhoto} from '../presentationEvents';
import {trafficContext} from '../traffic';
import {buildingDoor,dist} from '../world';
import {BURNING_TIMING,escapeSample} from '../burningEscape';
import type {Rng} from '../rng';
import { MINUTES_PER_SECOND } from '../constants';

/** On-screen durations, in simulated minutes at the current clock. */
const secs=(seconds:number)=>seconds*MINUTES_PER_SECOND;
import type {Building,Person,Vec2,WorldState} from '../types';
import { peopleList, buildingList } from '../entityLists';

/** Called before damage releases managers and destroys resident associations. */
export function startBuildingEmergency(w:WorldState,rng:Rng,b:Building,kind:'fire'|'explosion',delay=0,
  culprit?:Person,forceFatal?:boolean):Person[]{
  // Those actually inside: a reporter on the newspaper's books but out on the
  // street across town is not caught in its fire.
  const inside=w.lots[b.lotId].center;
  const residents=peopleList(w).filter(p=>p.status==='active'&&p.burningEscape?.week!==w.week&&
    (p.buildingId===b.id||b.hidesId!=null&&p.buildingId===b.hidesId)&&!p.inVehicle&&!p.dest&&dist(p.pos,inside)<20).slice(0,3);
  const pavement=buildingDoor(w,b),lot=w.lots[b.lotId],r=blockRect(w.blocks[b.blockId]);
  const facing=lot.facing??(Math.abs(pavement.x-lot.center.x)>Math.abs(pavement.y-lot.center.y)?
    pavement.x<lot.center.x?'west':'east':pavement.y<lot.center.y?'north':'south');
  const nx=facing==='east'?1:facing==='west'?-1:0,ny=facing==='south'?1:facing==='north'?-1:0;
  const startMinute=w.minute+delay*BURNING_TIMING.minutesPerSecond;
  residents.forEach((p,i)=>{
    // Two short, unobstructed legs: through the frontage, then along its pavement.
    const end={x:pavement.x+ny*(i%2?-1:1)*(7+i),y:pavement.y-nx*(i%2?-1:1)*(7+i)};
    if(nx)end.y=Math.max(r.y+1.5,Math.min(r.y+r.h-1.5,end.y));
    else end.x=Math.max(r.x+1.5,Math.min(r.x+r.w-1.5,end.x));
    const door={x:pavement.x-nx*1.6,y:pavement.y-ny*1.6};
    p.burningEscape={week:w.week,buildingId:b.id,startMinute:startMinute+secs(.3)*i,
      fatal:forceFatal??rng.chance(kind==='fire'?.25:.5),door,pavement:{...pavement},end,
      gangId:culprit?.gangId??null,perpetratorId:culprit?.id??null};
    p.pos={...door};p.inVehicle=false;p.orderId=null;p.streetOrder=null;clearDestination(p);
  });
  const burning=residents.find(p=>p.burningEscape?.fatal);
  if(burning){
    const bystanders=peopleList(w).filter(p=>p.role==='citizen'&&p.status==='active'&&
      p.buildingId==null&&!p.inVehicle&&p.burningEscape?.week!==w.week&&!p.shockReaction&&p.orderId==null&&!p.streetOrder&&
      Math.abs((p.pos.x-pavement.x)*nx+(p.pos.y-pavement.y)*ny)<2&&
      dist(p.pos,pavement)<15).sort((a,c)=>dist(a.pos,pavement)-dist(c.pos,pavement)).slice(0,6);
    bystanders.forEach((p,i)=>{
      // A short step along this pavement, away from the incident, never into traffic.
      const side=(p.pos.x-pavement.x)*ny-(p.pos.y-pavement.y)*nx>=0?1:-1;
      const to={x:p.pos.x+ny*side*.55,y:p.pos.y-nx*side*.55};
      if(nx)to.y=Math.max(Math.min(r.y+1,p.pos.y),Math.min(Math.max(r.y+r.h-1,p.pos.y),to.y));
      else to.x=Math.max(Math.min(r.x+1,p.pos.x),Math.min(Math.max(r.x+r.w-1,p.pos.x),to.x));
      p.shockReaction={week:w.week,startMinute:startMinute+secs(.8+i*.17),untilMinute:startMinute+secs(14.7+i*.17),
        victimId:burning.id,from:{...p.pos},to,resume:p.dest?{...p.dest}:null};
      clearDestination(p);
    });
  }
  // Reuse existing people. Only create the bounded municipal fire crew once.
  let firemen=peopleList(w).filter(p=>p.role==='firefighter'&&p.status==='active');
  const station=buildingList(w).filter(site=>site.cls==='municipal'&&site.id!==b.id)
    .sort((a,c)=>dist(w.lots[a.lotId].center,pavement)-dist(w.lots[c.lotId].center,pavement))[0];
  const firehouse=station?buildingDoor(w,station):{x:r.x-1.6,y:r.y-1.6};
  if(firemen.length<2){
    while(firemen.length<2)firemen.push(createPerson(w,rng,'firefighter',firehouse,{female:false}));
  }
  const available=(p:Person)=>p.status==='active'&&!p.emergencyResponse&&p.burningEscape?.week!==w.week&&
    !p.streetOrder&&p.orderId==null&&!p.inVehicle;
  const nearest=(people:Person[])=>people.filter(available).sort((a,c)=>dist(a.pos,pavement)-dist(c.pos,pavement));
  const police=nearest(w.policeIds.map(id=>w.people[id]).filter(Boolean)).slice(0,1);
  const reporters=nearest(peopleList(w).filter(p=>p.role==='reporter'&&
    (p.buildingId==null||w.buildings[p.buildingId]?.ownerPersonId!==p.id))).slice(0,1);
  const responders=[...police,...nearest(firemen).slice(0,2),...reporters];
  responders.forEach((p,i)=>{
    const target:Vec2={x:pavement.x+ny*(i-1)*1.4+nx*.55,y:pavement.y-nx*(i-1)*1.4+ny*.55};
    p.emergencyResponse={week:w.week,buildingId:b.id,startMinute,untilMinute:startMinute+secs(300),
      kind:p.role==='firefighter'?'fire':p.role==='reporter'?'reporter':'police',stage:'approaching',
      // The fire crew goes back to the station, not to wherever it last stood.
      home:p.role==='firefighter'?{...firehouse}:{...p.pos},target,lookAt:{...lot.center}};
    clearDestination(p);setDestination(w,p,target);
  });
  addMessage(w,'police',`Police, the fire brigade and the press are responding to the ${kind==='fire'?'fire':'bombing'}.`,pavement);
  return residents;
}

/** The end of an escape: the fatally burned die; a survivor is free to go
 *  about his business again (the record held him on the pavement all week). */
function finishEscape(w:WorldState,rng:Rng,p:Person):void{
  const escape=p.burningEscape;
  if(!escape)return;
  p.buildingId=null;
  const site = w.buildings[escape.buildingId];
  if (site && site.fireWeek === w.week) {
    if (escape.fatal) site.fireDead = (site.fireDead ?? 0) + 1;
    else site.fireInjured = (site.fireInjured ?? 0) + 1;
  }
  if(escape.fatal){
    // The body keeps the record: it is drawn charred where it fell.
    killPerson(w,p,'died from burns after escaping into the street');
    if(escape.gangId!=null&&escape.perpetratorId!=null)recordCrime(w,rng,{gangId:escape.gangId,
      perpetratorId:escape.perpetratorId,type:'kill',buildingId:escape.buildingId,victimId:p.id,pos:p.pos,severity:10});
    addMessage(w,'combat',`${p.name} escaped the building but died from burns.`,p.pos,p.id);
  }else delete p.burningEscape;
}

/** Escapes still under way when the week ends finish with it (week settlement). */
export function settleBurningEscapes(w:WorldState,rng:Rng):void{
  for(const p of peopleList(w)){
    const escape=p.burningEscape;
    if(!escape||escape.week!==w.week||p.status!=='active')continue;
    p.pos={...escapeSample(escape,Infinity).pos};
    finishEscape(w,rng,p);
  }
}

export function tickBuildingEmergencies(w:WorldState,rng:Rng,minutes:number):void{
  const traffic=trafficContext(w);
  for(const p of Object.values(w.people)){
    const shock=p.shockReaction;
    if(shock){
      if(shock.week!==w.week||p.status!=='active'||w.minute>=shock.untilMinute){
        delete p.shockReaction;
        if(p.status==='active'&&shock.resume&&!p.streetOrder&&p.orderId==null)setDestination(w,p,shock.resume);
      }else if(w.minute>=shock.startMinute){p.pos={...shock.to};clearDestination(p);}
    }
    const escape=p.burningEscape;
    if(escape&&escape.week===w.week&&p.status==='active'){
      const sample=escapeSample(escape,w.minute);p.pos=sample.pos;clearDestination(p);
      if(sample.finished)finishEscape(w,rng,p);
    }
    const response=p.emergencyResponse;
    if(!response)continue;
    if(response.week!==w.week||p.status!=='active'||p.streetOrder||p.orderId!=null){
      // A responder the week (not an order) relieved still walks home.
      if(p.status==='active'&&!p.streetOrder&&p.orderId==null)setDestination(w,p,response.home);
      delete p.emergencyResponse;continue;
    }
    if(w.minute<response.startMinute)continue;
    if(response.stage==='working'){
      if(response.kind==='reporter'&&Math.floor(w.minute-(response.arrivedMinute??0))%Math.round(secs(20))===0)presentPhoto(w,p);
      if(w.minute-(response.arrivedMinute??0)>=secs(53)){response.stage='returning';setDestination(w,p,response.home);}
    }else if(p.dest&&stepPerson(p,Math.min(minutes,w.minute-response.startMinute),traffic)){
      if(response.stage==='returning')delete p.emergencyResponse;
      else {response.stage='working';response.arrivedMinute=w.minute;if(response.kind==='reporter')presentPhoto(w,p);}
    }
    // Out of time on the job: home on foot (the fire crew has nothing else to
    // take it there and stood in the street for good).
    if(w.minute>response.untilMinute){delete p.emergencyResponse;setDestination(w,p,response.home);}
  }
}
