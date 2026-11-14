/**
 * 1.2.51 (Robert): every time shown in the UI and the reports reads as whole
 * hours and minutes ("9h 6m"), never as decimal hours ("9.1h").
 */
export function hm(minutes: number): string {
  const total = Math.round(minutes);
  const sign = total < 0 ? '−' : '';
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60), m = abs % 60;
  return h ? `${sign}${h}h ${m}m` : `${sign}${m}m`;
}
