// Fenêtre de modification d'un contenu (titre, texte…) : utilisée pour ses publications, vidéos de match et Moments.
import { useState } from 'react';
import { Sheet } from './kit';
import { t } from '../lib/i18n';

export interface EditField { key: string; label: string; value: string; max: number; multiline?: boolean; required?: boolean }

export function EditSheet({ title, fields, onSave, onClose }: { title: string; fields: EditField[]; onSave: (v: Record<string, string>) => Promise<void>; onClose: () => void }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const [busy, setBusy] = useState(false);
  const ok = fields.every((f) => !f.required || v[f.key].trim());
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="form">
        {fields.map((f) => <label key={f.key} className="label">{f.label}
          {f.multiline ? <textarea className="field" rows={4} maxLength={f.max} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
            : <input className="field" maxLength={f.max} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}</label>)}
        <button className="btn" disabled={busy || !ok} onClick={async () => { setBusy(true); try { await onSave(v); onClose(); } finally { setBusy(false); } }}>{t('Enregistrer')}</button>
      </div>
    </Sheet>
  );
}
