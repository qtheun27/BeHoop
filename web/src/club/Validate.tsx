// Validation du soir (parent lié ou coach de l'équipe) : chaque exercice coché reçoit À revoir / Correct / Maîtrisé,
// avec un mot facultatif pour le lendemain. Les règles Firestore empêchent le joueur de se valider lui-même.
import { useEffect, useState } from 'react';
import { useSession } from '../lib/session';
import { t, tn, locale } from '../lib/i18n';
import { api } from '../lib/api';
import { Skeleton, Empty } from '../ui/kit';
import { BY_ID } from '../hoopcamp/library';
import { addDays, fmtDose, ratingOf, today, type DayLog } from '../hoopcamp/engine';
import type { Rating } from '../hoopcamp/types';
import * as A from './api';
import { useClub, playerName } from './ctx';
import { RateButtons, ExerciseSheet, RATING_LABEL } from './HoopCamp';

export const pendingOf = (days: DayLog[]) => days.reduce((n, d) => n + d.items.filter((i) => d.checks?.[i.ex] && !d.ratings?.[i.ex]).length, 0);

export function Validate({ pid }: { pid: string }) {
  const s = useSession();
  const k = useClub();
  const [p, setP] = useState<A.Player | null | undefined>(undefined);
  const [days, setDays] = useState<DayLog[] | undefined>();
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  useEffect(() => { A.getPlayer(pid).then(setP).catch(() => setP(null)); }, [pid]);
  useEffect(() => A.watchDays(pid, addDays(today(), -21), setDays), [pid]);
  if (p === null) return <Empty ill="lock" title={t('Accès refusé.')} />;
  if (!p || !days) return <Skeleton n={3} />;
  const me = s.user!.uid, name = k.me?.display_name ?? s.profile?.displayName ?? '';
  const list = [...days].filter((d) => d.items.some((i) => d.checks?.[i.ex])).sort((a, b) => b.date.localeCompare(a.date));
  const rateIt = async (d: DayLog, ex: string, r: Rating) => {
    await A.rate(p.id, d.date, ex, r, me, name, msg[`${d.date}|${ex}`]);
    const left = d.items.filter((i) => d.checks?.[i.ex] && !d.ratings?.[i.ex] && i.ex !== ex).length;
    if (!left && !sent.has(d.date)) { setSent(new Set([...sent, d.date])); api('/notify/hoopcamp', { event: 'rated', playerId: p.id }).catch(() => {}); s.toast(t('Séance validée. Merci !')); }
  };
  const allCorrect = async (d: DayLog) => { for (const i of d.items.filter((x) => d.checks?.[x.ex] && !d.ratings?.[x.ex])) await rateIt(d, i.ex, 'correct'); };
  return (
    <>
      <section className="hc-hero small">
        <div className="hc-kick">✅ {t('Validation du soir')}</div>
        <h2>{playerName(p)}</h2>
        <p>{tn(pendingOf(days), '{n} exercice en attente', '{n} exercices en attente')} · {t('Regarde-le faire un exercice ou demande-lui de te le montrer, puis note honnêtement.')}</p>
      </section>
      {!list.length && <Empty ill="checkCircle" title={t('Rien à valider')} text={t('Les exercices cochés par le joueur apparaîtront ici.')} />}
      {list.map((d) => {
        const todo = d.items.filter((i) => d.checks?.[i.ex] && !d.ratings?.[i.ex]).length;
        return (
          <section key={d.date} className="hc-phase">
            <h3 className="group-title">{new Date(`${d.date}T12:00`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}
              {todo > 1 && <button className="btn small secondary" style={{ marginLeft: 'auto' }} onClick={() => allCorrect(d)}>{t('Tout « Correct »')}</button>}</h3>
            {d.note && <p className="hc-note">✍️ {d.note}</p>}
            <div className="group">
              {d.items.filter((i) => d.checks?.[i.ex]).map((i) => {
                const e = BY_ID.get(i.ex), r = ratingOf(d, i.ex), key = `${d.date}|${i.ex}`;
                return (
                  <div key={i.ex} className="val-item">
                    <button className="linklike nm" onClick={() => setOpen(i.ex)}>{e?.name ?? i.ex}</button>
                    <span className="sub">{fmtDose(i.dose)}{r?.self ? ` · ${t('auto-évaluation : {r}', { r: t(RATING_LABEL[r.r]) })}` : ''}</span>
                    <RateButtons value={d.ratings?.[i.ex]?.r} onRate={(x) => rateIt(d, i.ex, x)} />
                    {!d.ratings?.[i.ex] && <input className="field small" placeholder={t('Un mot pour demain (facultatif)')} maxLength={140} value={msg[key] ?? ''} onChange={(ev) => setMsg({ ...msg, [key]: ev.target.value })} />}
                    {d.ratings?.[i.ex]?.msg && <span className="sub">« {d.ratings[i.ex].msg} » — {d.ratings[i.ex].name}</span>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {open && BY_ID.get(open) && <ExerciseSheet e={BY_ID.get(open)!} onClose={() => setOpen(null)} onOpen={setOpen} />}
    </>
  );
}
