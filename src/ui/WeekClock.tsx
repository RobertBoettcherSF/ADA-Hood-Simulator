import { useEffect, useState } from 'react';
import { useGame } from '../app/store';
import { SPEED_STAGES, stageIndex } from '../app/speed';
import { DAY_START_HOUR, MINUTES_PER_DAY } from '../sim/constants';
import { dayIndex } from '../sim/world';

export const WEEK_DAYS=['Mon','Tue','Wed','Thu','Fri'];
export function weekTime(minute:number) {
  const h=DAY_START_HOUR+Math.floor((minute%MINUTES_PER_DAY)/60), m=minute%60;
  return `${((h+11)%12)+1}:${String(m).padStart(2,'0')} ${h<12?'am':'pm'}`;
}

/** The original's bottom-right clock and five-position accelerator. */
export function WeekClock() {
  const game = useGame();
  const {sim,speed,paused,speedUp,speedDown,finishingWeek}=game;
  const phase = sim?.world.phase;
  const [, paint] = useState(0);
  useEffect(() => {
    if (!sim || paused || phase !== 'week') return;
    let frame = 0;
    const tick = () => { paint(n => (n + 1) % 1000000); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sim, paused, phase, speed]);
  if(!sim)return null;
  const whole = sim.world.minute;
  const fraction = !paused && sim.world.phase === 'week' ? sim.subMinute : 0;
  const minute = whole + fraction;
  const stage=stageIndex(speed), h=DAY_START_HOUR+(minute%MINUTES_PER_DAY)/60;
  const day=WEEK_DAYS[dayIndex(whole)], time=weekTime(whole);
  const blur = !paused && (finishingWeek || speed > 1);
  const state=finishingWeek?'Finishing week':paused?'Paused':speed===1?'Normal speed':`${speed} times speed`;
  const minuteAngle = (minute % 60) * 6;
  const hourAngle = (h % 12) * 30;
  return <section className="week-clock" aria-label={`Game clock: ${day}, ${time}, ${state}`} title={`${day} · ${time} · ${state}`}>
    <div className="clock-shoulders">
      <button aria-label="Slower" title="Slower (<)" onClick={speedDown} disabled={stage===0}>‹</button>
      <div className="clock-speed" aria-label={`Time speed: ${speed===1?'Normal':`${speed} times`}`}>
        <svg viewBox="0 0 100 28" aria-hidden>
          <path d="M10 24 Q50 -12 90 24" fill="none" stroke="currentColor"/>
          {SPEED_STAGES.map((s,i)=><circle key={s} cx={12+i*19} cy={i===0||i===4?22:i===1||i===3?10:6} r="2"/>) }
          <path d="M50 27 L50 3" stroke="currentColor" strokeWidth="2" transform={`rotate(${-65+stage*32.5} 50 27)`}/>
        </svg>
      </div>
      <button aria-label="Faster" title="Faster (>)" onClick={speedUp} disabled={stage===SPEED_STAGES.length-1}>›</button>
    </div>
    <div className="clock-dial" role="img" aria-label={time}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <path d="M6 18V6H18 M82 6H94V18 M94 82V94H82 M18 94H6V82" fill="none" stroke="#8a8069"/>
        <circle cx="50" cy="50" r="43" fill="#e6dfcc" stroke="#8a8069"/>
        {Array.from({length:12},(_,i)=><line key={i} x1="50" y1="8" x2="50" y2={i%3===0?'17':'12'} stroke="#594a37" strokeWidth={i%3===0?'2':'1'} transform={`rotate(${i*30} 50 50)`}/>)}
        <text x="50" y="29">XII</text><text x="75" y="54">III</text><text x="50" y="80">VI</text><text x="25" y="54">IX</text>
        <path d="M50 55 L50 28" stroke="#382c1f" strokeWidth="3" transform={`rotate(${hourAngle} 50 50)`}/>
        {blur && [-10, -5, 5, 10].map(offset => (
          <path key={offset} d="M50 57 L50 14" stroke="#382c1f" strokeWidth="2" opacity="0.28" transform={`rotate(${minuteAngle + offset} 50 50)`}/>
        ))}
        <path d="M50 57 L50 14" stroke="#382c1f" strokeWidth="2" transform={`rotate(${minuteAngle} 50 50)`}/>
        <circle cx="50" cy="50" r="3" fill="#382c1f"/>
      </svg>
    </div>
    <div className="clock-day">{day}</div>
    <div className="clock-digital">{time}</div>
  </section>;
}
