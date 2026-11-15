/**
 * 1.2.59 (Robert): smaller Auto Test reports. A week's lines are compacted
 * before they go into the report: the long per-order lines are cut to the top
 * REPORT_TOP plus "N more", the OK and MANAGER SWAP given pairs are merged,
 * and the business buy results become one BUYS line plus the top failures.
 * BUILD, TEST KEY, LEARN, ORDER EXEC, HEAT, the CASH FIT head and FITNESS
 * lines are never touched.
 */

/** 1.2.59 (Robert): how many of each long per-order list are kept in a week. */
export const REPORT_TOP = 10;

/** The first n of a list joined, plus "N more" (paren-aware lists are split by the caller). */
export function topList(items: readonly string[], n = REPORT_TOP, sep = '; '): string {
  return items.length <= n ? items.join(sep) : `${items.slice(0, n).join(sep)}${sep}${items.length - n} more`;
}

const num = (re: RegExp, line: string): number | null => { const m = re.exec(line); return m ? Number(m[1].replace(/,/g, '')) : null; };

/** One week's planning lines, compacted. */
export function compactWeek(lines: readonly string[], week: number): string[] {
  const out: string[] = [];
  // --- WON: the top REPORT_TOP by score, in their order; "N more" after the last kept.
  const won = lines.map((line, i) => ({ line, i, score: line.startsWith('WON ') ? num(/score (-?[\d.]+)/, line) ?? 0 : null })).filter((x) => x.score != null);
  const wonKeep = new Set([...won].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.i - b.i).slice(0, REPORT_TOP).map((x) => x.i));
  const wonLast = won.length ? won[won.length - 1].i : -1;
  // --- ORDER FIT per order: only the outliers (net below 0, a man lost or arrested), the worst REPORT_TOP of them.
  const fit = lines.map((line, i) => ({ line, i })).filter((x) => x.line.startsWith('ORDER FIT #'));
  const outlier = (line: string) => (num(/= net \$(-?[\d,]+)/, line) ?? 0) < 0 || (num(/lost (\d+)/, line) ?? 0) > 0 || (num(/arreste?s?d? (\d+)/, line) ?? 0) > 0;
  const outliers = fit.filter((x) => outlier(x.line)).sort((a, b) => (num(/= net \$(-?[\d,]+)/, a.line) ?? 0) - (num(/= net \$(-?[\d,]+)/, b.line) ?? 0) || a.i - b.i);
  const fitKeep = new Set(outliers.slice(0, REPORT_TOP).map((x) => x.i));
  const fitLast = fit.length ? fit[fit.length - 1].i : -1;
  // --- NOTE business: the review of last week's buys becomes one BUYS line plus the first REPORT_TOP failures.
  const review = lines.map((line, i) => ({ line, i })).filter((x) => /^NOTE business: (buy|set up) .* (done|failed) \(/.test(x.line));
  const done = review.filter((x) => / done \(/.test(x.line));
  const failed = review.filter((x) => / failed \(/.test(x.line));
  const reasons = new Map<string, number>();
  for (const x of failed) {
    const why = (/ failed \((.*)\); failure/.exec(x.line)?.[1] ?? 'unknown').replace(/ [^.;]+ is not free yet; this order needs that person\./, ' the named man was not free yet.').replace(/;/g, ',');
    reasons.set(why, (reasons.get(why) ?? 0) + 1);
  }
  const reviewKeep = new Set(failed.slice(0, REPORT_TOP).map((x) => x.i));
  const reviewFirst = review.length ? review[0].i : -1;
  const reviewLast = review.length ? review[review.length - 1].i : -1;
  // --- NOTE business: buys given this week — the first REPORT_TOP, then "N more".
  const givenBuys = lines.map((line, i) => ({ line, i })).filter((x) => /^NOTE business: .* to .* — about /.test(x.line));
  const givenKeep = new Set(givenBuys.slice(0, REPORT_TOP).map((x) => x.i));
  const givenLast = givenBuys.length ? givenBuys[givenBuys.length - 1].i : -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === reviewFirst) {
      out.push(`BUYS week ${week - 1}: ${review.length} judged — ${done.length} done, ${failed.length} failed${reasons.size ? ` (${[...reasons].sort((a, b) => b[1] - a[1]).map(([why, n]) => `${why} ×${n}`).join('; ')})` : ''}`);
    }
    if (won.length && line.startsWith('WON ')) {
      if (wonKeep.has(i)) out.push(line);
      if (i === wonLast && won.length > REPORT_TOP) out.push(`WON … ${won.length - REPORT_TOP} more given (lower scores)`);
      continue;
    }
    if (line.startsWith('ORDER FIT #')) {
      if (fitKeep.has(i)) out.push(line);
      if (i === fitLast && fit.length > fitKeep.size) out.push(`ORDER FIT … ${fit.length - fitKeep.size} more per-order line(s) not shown (${outliers.length} outlier(s) in all; outliers: net below $0, a man lost or arrested)`);
      continue;
    }
    if (review.length && /^NOTE business: (buy|set up) .* (done|failed) \(/.test(line)) {
      if (reviewKeep.has(i)) out.push(line);
      if (i === reviewLast && review.length > reviewKeep.size) out.push(`NOTE business: … ${review.length - reviewKeep.size} more result line(s) (counted in BUYS)`);
      continue;
    }
    if (givenBuys.length && /^NOTE business: .* to .* — about /.test(line)) {
      if (givenKeep.has(i)) out.push(line);
      if (i === givenLast && givenBuys.length > REPORT_TOP) out.push(`NOTE business: … ${givenBuys.length - REPORT_TOP} more buy(s) given`);
      continue;
    }
    // --- an OK line followed by its MANAGER SWAP given line: one line.
    if (line.startsWith('OK manager ') && lines[i + 1]?.startsWith('MANAGER SWAP given: ')) {
      const who = / \(([^)]*)\) — /.exec(line);
      out.push(`${lines[i + 1]}${who ? ` — by ${who[1]}` : ''}`);
      i++;
      continue;
    }
    out.push(line);
  }
  return out;
}
