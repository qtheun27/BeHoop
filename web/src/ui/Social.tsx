// Volet social : réactions et commentaires sous les actus, les matchs et les publications (threads/{clé}, voir db.ts).
// Matchs de jeunes : réactions positives seulement, pas de commentaires (pas de moquerie possible envers des enfants).
import { useEffect, useRef, useState } from 'react';
import * as D from '../lib/db';
import { useSession } from '../lib/session';
import { t } from '../lib/i18n';
import { ago, haptic } from '../lib/util';
import { teamIndex } from '../lib/data';
import { Sheet, Avatar, Empty, Skeleton } from './kit';
import { Ico } from './icons';

/** Vrai quand l'élément entre à l'écran (on ne charge les compteurs que des cartes vues) */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || seen) return;
    if (!('IntersectionObserver' in window)) { setSeen(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el); return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

/** Une équipe de jeunes parmi celles du match (catégorie connue par les données publiques) */
export function useYouth(teamIds: number[]) {
  const [youth, setYouth] = useState(false);
  useEffect(() => {
    let on = true;
    teamIndex().then((idx) => { if (on) setYouth(teamIds.some((id) => { const e = idx.get(id); return !!e && e.team.ag !== 'seniors'; })); }).catch(() => {});
    return () => { on = false; };
  }, [teamIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  return youth;
}

/** Réactions + bouton commentaires sous une actu ou un match */
export function SocialBar({ k, title, youth, right }: { k: D.ThreadKey; title: string; youth?: boolean; right?: React.ReactNode }) {
  const s = useSession();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [th, setTh] = useState<D.Thread>({ reactions: {}, comments: 0 });
  const [mine, setMine] = useState<D.Emoji | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (seen) D.getThread(k).then(setTh).catch(() => {}); }, [seen, k]);
  useEffect(() => { if (seen && s.user) D.myThreadReaction(k, s.user.uid).then(setMine).catch(() => {}); }, [seen, k, s.user]);
  const onReact = async (e: D.Emoji) => {
    if (!s.requireAuth()) return;
    haptic();
    const prev = mine, next = mine === e ? null : e, before = th;
    const r = { ...th.reactions };
    if (prev) r[prev] = Math.max(0, (r[prev] ?? 1) - 1);
    if (next) r[next] = (r[next] ?? 0) + 1;
    setMine(next); setTh({ ...th, reactions: r });
    try { await D.reactThread(k, s.user!.uid, next, prev); } catch { setMine(prev); setTh(before); s.toast(t('Réaction non enregistrée')); }
  };
  return (
    <div className="card-actions" ref={ref}>
      {D.EMOJIS.map((e) => <button key={e} className={`react${mine === e ? ' on' : ''}`} onClick={() => onReact(e)} aria-pressed={mine === e} aria-label={t('Réagir {e}', { e })}>{e}{th.reactions[e] ? <span>{th.reactions[e]}</span> : null}</button>)}
      {!youth && <button className="react" onClick={() => setOpen(true)} aria-label={t('Commentaires')}><Ico n="comment" />{th.comments > 0 && <span>{th.comments}</span>}</button>}
      <span style={{ flex: 1 }} />
      {right}
      {open && <CommentsSheet k={k} title={title} onClose={() => setOpen(false)} onCount={(n) => setTh((x) => ({ ...x, comments: n }))} />}
    </div>
  );
}

/** Bouton commentaires seul (publications : leurs réactions restent sur la publication) */
export function CommentButton({ k, title, youth }: { k: D.ThreadKey; title: string; youth?: boolean }) {
  const [ref, seen] = useSeen<HTMLButtonElement>();
  const [n, setN] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (seen) D.getThread(k).then((x) => setN(x.comments)).catch(() => {}); }, [seen, k]);
  if (youth) return null;
  return (
    <>
      <button ref={ref} className="react" onClick={() => setOpen(true)} aria-label={t('Commentaires')}><Ico n="comment" />{n > 0 && <span>{n}</span>}</button>
      {open && <CommentsSheet k={k} title={title} onClose={() => setOpen(false)} onCount={setN} />}
    </>
  );
}

export function CommentsSheet({ k, title, onClose, onCount }: { k: D.ThreadKey; title: string; onClose: () => void; onCount?: (n: number) => void }) {
  const s = useSession();
  const [list, setList] = useState<D.Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<D.Comment | null>(null);
  useEffect(() => { D.listComments(k).then(setList).catch(() => setList([])); }, [k]);
  const shown = (list ?? []).filter((c) => !c.hidden || s.isAdmin || c.authorUid === s.user?.uid);
  const send = async () => {
    const v = text.trim(); if (!v || busy) return;
    if (!s.requireAuth() || !s.profile) return;
    setBusy(true);
    try {
      const id = await D.addComment(k, s.user!.uid, s.profile.displayName, v);
      const next = [...(list ?? []), { id, authorUid: s.user!.uid, authorName: s.profile.displayName, text: v, createdAt: Date.now(), hidden: false }];
      setList(next); setText(''); onCount?.(next.length); haptic();
    } catch { s.toast(t('Commentaire non envoyé. Réessaie.')); }
    setBusy(false);
  };
  const act = async (f: () => Promise<unknown>, m: string, upd: (l: D.Comment[]) => D.Comment[]) => {
    try { await f(); const l = upd(list ?? []); setList(l); onCount?.(l.filter((c) => !c.hidden).length); s.toast(m); } catch { s.toast(t('Action impossible. Réessaie.')); }
    setMenu(null);
  };
  return (
    <Sheet title={t('Commentaires')} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>{title}</p>
      {!list ? <Skeleton h={56} n={3} /> : shown.length === 0 ? <Empty ill="comment" title={t('Pas encore de commentaire')} text={t('Lance la discussion !')} /> : (
        <div className="group">{shown.map((c) => (
          <div key={c.id} className="row" style={{ alignItems: 'flex-start', opacity: c.hidden ? .5 : 1 }}>
            <Avatar name={c.authorName} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14 }}><b>{c.authorName}</b> <span className="muted">· {ago(c.createdAt)}</span>{c.hidden && <span className="muted"> · {t('Masqué')}</span>}</div>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 2 }}>{c.text}</div>
            </div>
            <button className="icon-btn" aria-label={t('Plus d\'options')} onClick={() => setMenu(c)}><Ico n="more" /></button>
          </div>))}</div>)}
      <p className="muted" style={{ fontSize: 13, margin: '12px 4px 6px' }}><Ico n="shield" style={{ marginRight: 4 }} />{t('Reste respectueux : pas de moquerie, d’insulte ni de propos sur un joueur. Les commentaires signalés sont vérifiés.')}</p>
      <textarea className="field" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Ton commentaire…')} aria-label={t('Ton commentaire…')}
        style={{ width: '100%', minHeight: 72, resize: 'none' }} onFocus={() => s.requireAuth()} />
      <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <span className="muted" style={{ fontSize: 13 }}>{text.length}/500</span>
        <button className="btn small" disabled={!text.trim() || busy} onClick={send}>{t('Envoyer')}</button>
      </div>
      {menu && <Sheet title={t('Options')} onClose={() => setMenu(null)}>
        <div className="group">
          {menu.authorUid === s.user?.uid && <button className="row" style={{ color: 'var(--red)' }} onClick={() => confirm(t('Supprimer ce commentaire ?')) && act(() => D.deleteComment(k, menu.id, s.user!.uid), t('Commentaire supprimé'), (l) => l.filter((c) => c.id !== menu.id))}>{t('Supprimer')}</button>}
          {s.isAdmin && !menu.hidden && <button className="row" onClick={() => act(() => D.hideComment(k, menu.id), t('Commentaire masqué'), (l) => l.map((c) => (c.id === menu.id ? { ...c, hidden: true } : c)))}>{t('Masquer')}</button>}
          {s.isAdmin && menu.hidden && <button className="row" onClick={() => act(() => D.hideComment(k, menu.id, false), t('Contenu réactivé'), (l) => l.map((c) => (c.id === menu.id ? { ...c, hidden: false } : c)))}>{t('Réactiver')}</button>}
          {menu.authorUid !== s.user?.uid && D.REPORT_REASONS.map((r) => <button key={r} className="row" onClick={() => s.requireAuth() && act(() => D.report(D.commentReportId(k, menu.id), s.user!.uid, r), t('Merci, on va regarder.'), (l) => l)}>{t('Signaler')} · {t(r)}</button>)}
        </div>
      </Sheet>}
    </Sheet>
  );
}

