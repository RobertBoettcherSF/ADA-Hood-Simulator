const REPO = 'RobertBoettcherSF/ADA-Hood-Simulator';

export const PLAY_URL = `https://raw.githack.com/${REPO}/main/play/index.html`;

export interface UpdateOffer {
  current: string;
  latest: string;
  url: string;
}

function parseVersion(text: string): string | null {
  const match = text.match(/"version"\s*:\s*"(\d+(?:\.\d+){2,3})"/);
  return match ? match[1] : null;
}

function compare(a: string, b: string): number {
  const left = a.split('.').map((n) => Number(n));
  const right = b.split('.').map((n) => Number(n));
  const parts = Math.max(left.length, right.length, 3);
  for (let i = 0; i < parts; i++) {
    const d = (left[i] ?? 0) - (right[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Look at main on GitHub. A newer version is offered; a failure does not block play. */
export async function checkForUpdate(current: string): Promise<UpdateOffer | null> {
  const versionFile = await fetchText(`https://raw.githubusercontent.com/${REPO}/main/version.json`);
  const pack = versionFile ?? await fetchText(`https://raw.githubusercontent.com/${REPO}/main/package.json`);
  const latest = pack ? parseVersion(pack) : null;
  if (!latest || compare(latest, current) <= 0) return null;
  return { current, latest, url: PLAY_URL };
}

export async function latestCommit(): Promise<string | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return null;
    const body = await response.json() as { sha?: string; commit?: { message?: string } };
    if (!body.sha) return null;
    const message = body.commit?.message?.split('\n')[0] ?? '';
    return `${body.sha.slice(0, 12)} ${message}`.trim();
  } catch {
    return null;
  }
}
