// Vestiaire : le Hoop Camp de mes joueurs (ma fiche, mes enfants), avec les exercices à valider pour les parents
import { useEffect, useState } from 'react';
import { t, tn } from '../lib/i18n';
import { HoopCampCard } from './HoopCamp';
import { pendingOf } from './Validate';
import { watchDays, type Player } from './api';
import { addDays, today } from '../hoopcamp/engine';
import './space.css';

export default function VestiaireCamp({ players }: { players: Player[] }) {
  return (
    <>
      {players.map((p) => <CampBlock key={p.id} p={p} parent={!!p.parent_uids.length && !p.account_uid} />)}
      <a className="next-game" href="#/camp/playbook"><span className="grow"><b>Playbook</b><small>{t('Les systèmes et exercices de ton coach, animés')}</small></span><span className="chev">›</span></a>
    </>
  );
}
function CampBlock({ p, parent }: { p: Player; parent: boolean }) {
  const [pending, setPending] = useState(0);
  useEffect(() => watchDays(p.id, addDays(today(), -21), (d) => setPending(pendingOf(d))), [p.id]);
  return (
    <section className="child">
      {parent && <div className="child-head"><b>{p.prenom}</b>{pending > 0 && <a className="pill-pend big" href={`#/camp/valider/${p.id}`}>{tn(pending, '{n} exercice à valider', '{n} exercices à valider')} ›</a>}</div>}
      <HoopCampCard p={p} viewer={parent ? 'parent' : 'player'} />
    </section>
  );
}
