// « Aide / Contact » : conversations avec l'équipe BeHoop (super admin), comme une messagerie ; notifications des deux côtés
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../lib/session';
import { t, locale } from '../lib/i18n';
import { api } from '../lib/api';
import { Sheet, Skeleton, useAsync } from './kit';

export interface SupportMsg { from: 'user' | 'admin'; text: string; at: string }
export interface SupportThread { id: string; uid: string; email: string; name: string; subject: string; status: string; page?: string; messages: SupportMsg[]; updated_at: string; unread_admin: boolean; unread_user: boolean }
export const myThreads = (read?: string) => api<SupportThread[]>('/support/mine', read ? { read } : {});
const when = (iso: string) => new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Fil de messages (bulles) + zone de réponse ; me = côté de la personne qui lit */
export function Conversation({ th, me, onSend }: { th: SupportThread; me: 'user' | 'admin'; onSend: (text: string) => Promise<void> }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [th.messages.length]);
  return (
    <div className="chat">
      <div className="chat-list">
        {th.messages.map((m, i) => (
          <div key={i} className={`bubble ${m.from === me ? 'me' : 'them'}`}>
            <p>{m.text}</p><small>{m.from === 'admin' ? t('Équipe BeHoop') : th.name || th.email} · {when(m.at)}</small>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="chat-send">
        <textarea className="field" rows={2} maxLength={3000} placeholder={t('Ton message')} value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn small" disabled={busy || !v.trim()} onClick={async () => { setBusy(true); try { await onSend(v.trim()); setV(''); } finally { setBusy(false); } }}>{t('Envoyer')}</button>
      </div>
    </div>
  );
}

export function HelpSheet({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const list = useAsync(() => myThreads(), []);
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const [f, setF] = useState({ subject: '', message: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (list.data && !list.data.length && open === null) setOpen('new'); }, [list.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const th = list.data?.find((x) => x.id === open);
  useEffect(() => { if (th?.unread_user) myThreads(th.id).then(list.set).catch(() => {}); }, [th?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet title={th ? th.subject || t('Sans sujet') : t('Aide / Contact')} onClose={onClose} right={open && list.data?.length ? <button className="btn ghost small" onClick={() => setOpen(null)}>‹</button> : undefined}>
      <div style={{ padding: '0 16px 20px' }}>
        {list.loading ? <Skeleton n={2} h={60} /> : open === 'new' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <p className="muted" style={{ margin: 0 }}>{t('Une question, un souci, une idée ? Écris-nous : la réponse arrive ici, avec une notification.')}</p>
            <input className="field" placeholder={t('Sujet')} maxLength={120} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
            <textarea className="field" rows={6} placeholder={t('Ton message')} maxLength={3000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
            <button className="btn" disabled={busy || !f.message.trim()} onClick={async () => {
              setBusy(true);
              try { const r = await api<{ id: string }>('/support/send', { ...f, page: location.hash }); s.toast(t('Message envoyé. Merci !')); setF({ subject: '', message: '' }); list.set(await myThreads()); setOpen(r.id); }
              catch { s.toast(t('Impossible d’envoyer. Réessaie.')); } finally { setBusy(false); }
            }}>{t('Envoyer')}</button>
          </div>
        ) : th ? (
          <Conversation th={th} me="user" onSend={async (text) => { await api('/support/send', { thread: th.id, message: text }); list.set(await myThreads()); }} />
        ) : (
          <>
            <button className="btn" style={{ width: '100%', marginBottom: 12 }} onClick={() => setOpen('new')}>{t('Nouveau message')}</button>
            <div className="group">
              {(list.data ?? []).map((x) => (
                <button key={x.id} className="row" onClick={() => setOpen(x.id)}>
                  <div className="grow">{x.unread_user && <b style={{ color: 'var(--accent)' }}>● </b>}{x.subject || t('Sans sujet')}
                    <div className="sub ellipsis">{x.messages[x.messages.length - 1]?.text} · {when(x.updated_at)}</div></div><span className="chev">›</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
