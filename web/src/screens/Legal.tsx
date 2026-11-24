import { Screen } from '../ui/kit';
import { t } from '../lib/i18n';
import { DOCS } from '../legalDocs';

export function Legal({ doc }: { doc: string }) {
  const d = DOCS[doc] ?? DOCS.cgu;
  return (
    <Screen title={t(d.title)} back="profil">
      <p className="pill" style={{ background: 'var(--gold)', color: '#000' }}>{t('Brouillon — à relire')}</p>
      {d.body.map(([h, txt]) => <section key={h}><h2 style={{ fontSize: 20, margin: '20px 0 6px' }}>{t(h)}</h2><p style={{ margin: 0 }}>{t(txt)}</p></section>)}
      <p className="muted mt" style={{ fontSize: 13 }}>{t('Version')} 2026-10</p>
    </Screen>
  );
}
