// Tableau de classement unique (page équipe, page compétition) : ordre et rang officiels, voir ranked().
// D = joués − victoires − nuls : les forfaits, que les fédérations comptent à part, sont des défaites.
import { ranked, dataSource, type Standing } from '../lib/data';
import { t } from '../lib/i18n';

export function StandingsTable({ rows, names, me, pct: forcePct }: { rows: Standing[]; names: Map<number, string>; me?: number; pct?: boolean }) {
  const list = ranked(rows);
  // Ligues sans points au classement (NBA, WNBA, EuroLeague, EuroCup : points = victoires) → % de victoires
  const pct = forcePct ?? (list.length > 0 && list.some((r) => r.played) && list.every((r) => r.pts === r.wins));
  const nuls = list.some((r) => r.draws);
  const col = (w: number, align: 'center' | 'right' = 'center') => ({ width: w, textAlign: align, flex: 'none' as const });
  return (
    <div className="group standings">
      <div className="row sub" style={{ minHeight: 30, fontWeight: 600 }}>
        <span style={col(26, 'center')}>#</span><span className="grow">{t('Équipe')}</span>
        <span style={col(24)}>{t('J')}</span><span style={col(24)}>{t('V')}</span>{nuls && <span style={col(24)}>{t('N')}</span>}<span style={col(24)}>{t('D')}</span>
        <span style={col(34, 'right')}>{pct ? '%' : t('Pts')}</span>
      </div>
      {list.map((r) => { const mine = r.team === me; return (
        <a key={r.team} className="row" href={`#/equipe/${r.team}`} style={{ color: 'inherit', minHeight: 44, background: mine ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined, fontWeight: mine ? 700 : 400 }}>
          <span style={{ ...col(26), fontFamily: 'Anton', color: r.rank <= 3 ? 'var(--accent)' : undefined }}>{r.rank}</span>
          <span className="grow ellipsis" style={{ fontSize: 15 }}>{names.get(r.team) ?? `${t('Équipe')} ${r.team}`}</span>
          <span style={col(24)}>{r.played}</span><span style={col(24)}>{r.wins}</span>{nuls && <span style={col(24)}>{r.draws ?? 0}</span>}<span style={col(24)}>{r.played - r.wins - (r.draws ?? 0)}</span>
          <span style={{ ...col(34, 'right'), fontFamily: 'Anton' }}>{pct ? (r.played ? (r.wins / r.played).toFixed(3).replace(/^0/, '') : '–') : r.pts}</span>
        </a>); })}
      {list.length > 0 && <div className="source-note">{t('Source : {s}', { s: dataSource(list[0].team) })}</div>}
    </div>
  );
}
