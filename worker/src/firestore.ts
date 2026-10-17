// Mini-client Firestore REST (compte de service). Conversion JSON <-> format « Value » de Firestore.
type Json = null | boolean | number | string | Json[] | { [k: string]: Json } | Date;
type FsValue = Record<string, unknown>;

export function toValue(v: Json | undefined): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
}
export function fromValue(v: any): any {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return new Date(v.timestampValue).getTime();
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromValue(x)]));
  return null;
}

export class Firestore {
  constructor(private project: string, private token: () => Promise<string>) {}
  private get base() { return `https://firestore.googleapis.com/v1/projects/${this.project}/databases/(default)/documents`; }
  private async req(path: string, init: RequestInit = {}) {
    const r = await fetch(path.startsWith('http') ? path : `${this.base}/${path}`, { ...init, headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Firestore ${r.status} ${await r.text()}`);
    return r.json() as Promise<any>;
  }
  async get<T = any>(path: string): Promise<T | null> {
    const d = await this.req(path);
    return d ? ({ ...fromValue({ mapValue: { fields: d.fields ?? {} } }), _id: d.name.split('/').pop() } as T) : null;
  }
  /** Écrit/fusionne les champs donnés (les autres champs du document sont conservés). */
  async set(path: string, data: Record<string, Json>, merge = true) {
    const mask = merge ? Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent('`' + k + '`')}`).join('&') : '';
    return this.req(`${path}${mask ? '?' + mask : ''}`, { method: 'PATCH', body: JSON.stringify({ fields: (toValue(data as Json) as any).mapValue.fields }) });
  }
  async create(path: string, data: Record<string, Json>) {
    return this.req(`${path}?currentDocument.exists=false`, { method: 'PATCH', body: JSON.stringify({ fields: (toValue(data as Json) as any).mapValue.fields }) }).catch((e) => { if (String(e).includes('409') || String(e).includes('ALREADY_EXISTS') || String(e).includes('FAILED_PRECONDITION')) return null; throw e; });
  }
  async delete(path: string) { return this.req(path, { method: 'DELETE' }); }
  /** Requête structurée : where = [[champ, op, valeur]] ; parent = « » ou chemin d'un document. */
  async query(collection: string, where: [string, string, Json][], opts: { allDescendants?: boolean; parent?: string; limit?: number } = {}) {
    const filters = where.map(([f, op, v]) => ({ fieldFilter: { field: { fieldPath: f }, op, value: toValue(v) } }));
    const body = { structuredQuery: { from: [{ collectionId: collection, allDescendants: !!opts.allDescendants }],
      where: filters.length > 1 ? { compositeFilter: { op: 'AND', filters } } : filters[0], limit: opts.limit ?? 500 } };
    const res = (await this.req(`${opts.parent ? this.base + '/' + opts.parent : this.base}:runQuery`, { method: 'POST', body: JSON.stringify(body) })) as any[];
    return (res ?? []).filter((x) => x.document).map((x) => ({ ...fromValue({ mapValue: { fields: x.document.fields ?? {} } }), _path: x.document.name.split('/documents/')[1] }));
  }
}
