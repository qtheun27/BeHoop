// « Aide / Contact » : message au super admin (console de modération → Messages), qui répond par e-mail
import { useState } from 'react';
import { useSession } from '../lib/session';
import { t } from '../lib/i18n';
import { api } from '../lib/api';
import { Sheet } from './kit';

export function HelpSheet({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const [f, setF] = useState({ subject: '', message: '' });
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={t('Aide / Contact')} onClose={onClose}>
      <div className="form" style={{ display: 'grid', gap: 10, padding: '0 16px 20px' }}>
        <p className="muted" style={{ margin: 0 }}>{t('Une question, un souci, une idée ? Écris-nous : on te répond par e-mail à {e}.', { e: s.user?.email ?? '' })}</p>
        <input className="field" placeholder={t('Sujet')} maxLength={120} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <textarea className="field" rows={6} placeholder={t('Ton message')} maxLength={3000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
        <button className="btn" disabled={busy || !f.message.trim()} onClick={async () => {
          setBusy(true);
          try { await api('/support/send', { ...f, page: location.hash }); s.toast(t('Message envoyé. Merci !')); onClose(); }
          catch { s.toast(t('Impossible d’envoyer. Réessaie.')); } finally { setBusy(false); }
        }}>{t('Envoyer')}</button>
      </div>
    </Sheet>
  );
}
