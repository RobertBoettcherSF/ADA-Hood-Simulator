import { GANG_COLORS } from '../sim/constants';
import type { Gang, Person } from '../sim/types';
import { bossPortraitUrl, portraitUrl } from './art';
import { useArtStatus } from './useArtStatus';

/**
 * A period photograph. Heritage faces use the nationality paintings; everyone
 * else uses the painted pool. The picture is in the page immediately, so a
 * cartoon stand-in never flashes while it loads. A missing file shows a sepia
 * initial instead.
 */
export function Portrait({ person, gang, size = 30 }: { person: Person; gang?: Gang; size?: number }) {
  const boss = bossPortraitUrl(person.face);
  const bossStatus = useArtStatus(boss);
  const pool = portraitUrl(person);
  const poolStatus = useArtStatus(pool);
  const useBoss = !!boss && bossStatus !== 'failed';
  const src = useBoss ? boss! : pool;
  const status = useBoss ? bossStatus : poolStatus;
  const gone = person.status === 'dead';
  const initial = person.name.replace(/[^A-Za-z]/g, '').slice(0, 1) || '?';
  return (
    <span
      className="portrait painted sepia-face"
      style={{ width: size, height: size, ...(gone ? { filter: 'grayscale(1)', opacity: 0.65 } : {}) }}
      role="img"
      aria-label={person.name}
    >
      {status === 'failed'
        ? <b className="portrait-initial">{initial}</b>
        : <img src={src} alt="" width={size} height={size} draggable={false} style={{ position: 'absolute', inset: 0, objectFit: 'cover' }} />}
      {gang && <i className="strip" style={{ background: GANG_COLORS[gang.color].light }} />}
    </span>
  );
}
