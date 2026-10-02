import { useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Modal } from '../components/Modal';
import type { Tone } from '../components/StatusChip';
import './DocumentosPage.css';

const CATEGORIES = ['Facturas', 'Contratos', 'Órdenes de compra', 'Guías de remisión', 'Otros'];
const EXT_TONE: Record<string, Tone> = { PDF: 'red', XML: 'amber', XLSX: 'green', DOCX: 'blue' };
const ROLES: Record<string, string[]> = {
  Facturas: ['Gerencia', 'Ventas', 'Contabilidad'],
  Contratos: ['Gerencia', 'Legal'],
  'Órdenes de compra': ['Gerencia', 'Compras', 'Almacén'],
  'Guías de remisión': ['Ventas', 'Almacén'],
  Otros: ['Gerencia', 'Finanzas'],
};

interface Doc {
  id: number;
  name: string;
  cat: string;
  /** Linked operation code. */
  ref: string;
  entity: string;
  size: string;
  date: string;
  by: string;
  version: string;
}

const SEED: Doc[] = [
  ['F001-00248.pdf', 'Facturas', 'OV-2026-1284', 'Distribuidora Andina S.A.C.', '182 KB', '02 oct 2026', 'María Rojas'],
  ['F001-00248.xml', 'Facturas', 'OV-2026-1284', 'Distribuidora Andina S.A.C.', '14 KB', '02 oct 2026', 'Sistema'],
  ['Contrato_suministro_2026_MineraAndes.pdf', 'Contratos', 'CLI-000318', 'Minera Los Andes S.A.', '2.4 MB', '01 oct 2026', 'Luis Paredes'],
  ['OC-2026-0412_Aceros_del_Sur.pdf', 'Órdenes de compra', 'OC-2026-0412', 'Aceros del Sur S.A.C.', '96 KB', '30 sep 2026', 'Ana Torres'],
  ['Guia_T001-00877.pdf', 'Guías de remisión', 'OV-2026-1282', 'Minera Los Andes S.A.', '128 KB', '30 sep 2026', 'Carlos Huamán'],
  ['Conciliacion_bancaria_set2026.xlsx', 'Otros', 'FIN-CB-2026-09', 'Banco de Crédito · Cta. 191-2345', '312 KB', '29 sep 2026', 'Rosa Medina'],
  ['F001-00241.pdf', 'Facturas', 'OV-2026-1281', 'Farmacias Salud Total S.A.C.', '176 KB', '27 sep 2026', 'María Rojas'],
  ['Recepcion_almacen_OC0409.jpg', 'Órdenes de compra', 'OC-2026-0409', 'Plásticos Lima S.R.L.', '1.8 MB', '26 sep 2026', 'Jorge Quispe'],
  ['Adenda_contrato_Textil_Arequipa.docx', 'Contratos', 'CLI-000207', 'Textil Arequipa S.R.L.', '64 KB', '24 sep 2026', 'Luis Paredes'],
  ['Nota_credito_FC01-00032.pdf', 'Facturas', 'OV-2026-1265', 'Comercial Norte Trujillo S.A.', '88 KB', '22 sep 2026', 'Rosa Medina'],
].map(([name, cat, ref, entity, size, date, by], i) => ({ id: i, name, cat, ref, entity, size, date, by, version: i % 3 === 0 ? 'v2 · actual' : 'v1 · actual' }));

const extOf = (name: string) => (name.split('.').pop() ?? '').toUpperCase();
const humanSize = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const COLS = 'minmax(0, 1.6fr) minmax(0, 1.2fr) 64px 76px 32px';

function FileTag({ name }: { name: string }) {
  const ext = extOf(name);
  return <span className={'filetag chip--' + (EXT_TONE[ext] ?? 'muted')}>{ext}</span>;
}

function UploadModal({ onClose, onUpload }: { onClose: () => void; onUpload: (d: Omit<Doc, 'id'>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [cat, setCat] = useState('Facturas');
  const [ref, setRef] = useState('');

  const pick = (f: File | undefined) => f && setFile({ name: f.name, size: f.size });

  return (
    <Modal
      title="Subir documento"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" style={{ height: 30 }} onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="btn btn--primary"
            style={{ height: 30, padding: '0 14px', opacity: file ? 1 : 0.5 }}
            disabled={!file}
            onClick={() =>
              file &&
              onUpload({ name: file.name, cat, ref: ref.trim() || 'Sin vincular', entity: ref.trim() ? 'Operación vinculada' : '—', size: humanSize(file.size), date: '02 oct 2026', by: 'María Rojas', version: 'v1 · actual' })
            }
          >
            Subir
          </button>
        </>
      }
    >
      <input type="file" ref={input} style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} />
      <div
        className={'dropzone' + (drag ? ' is-drag' : '')}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={e => e.key === 'Enter' && input.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16" /></svg>
        <div style={{ fontWeight: 500 }}>{file ? file.name : 'Arrastra un archivo aquí o haz clic para seleccionar'}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{file ? humanSize(file.size) + ' · listo para subir' : 'PDF, XML, XLSX, DOCX o imágenes · máx. 25 MB'}</div>
      </div>
      <label className="field">
        <span className="field__label">Categoría</span>
        <select className="field__control" style={{ height: 32 }} value={cat} onChange={e => setCat(e.target.value)}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Relacionar con operación</span>
        <input className="field__control mono" style={{ height: 32, fontSize: 12 }} value={ref} onChange={e => setRef(e.target.value)} placeholder="Ej. OV-2026-1284, OC-2026-0412" />
      </label>
    </Modal>
  );
}

export function DocumentosPage() {
  const [docs, setDocs] = useState<Doc[]>(SEED);
  const [cat, setCat] = useState('Todos');
  const [query, setQuery] = useState('');
  const [selId, setSelId] = useState(0);
  const [uploading, setUploading] = useState(false);

  const q = query.trim().toLowerCase();
  const searched = docs.filter(d => !q || (d.name + d.ref + d.entity).toLowerCase().includes(q));
  const list = cat === 'Todos' ? searched : searched.filter(d => d.cat === cat);
  const sel = docs.find(d => d.id === selId) ?? list[0];

  return (
    <AppShell
      active="Documentos"
      breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Documentos' }]}
      actions={
        <button type="button" className="btn btn--primary" onClick={() => setUploading(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16" /></svg>
          Subir documento
        </button>
      }
    >
      <div className="page-head">
        <div>
          <h1 className="page__title">Documentos</h1>
          <div className="page__subtitle">Repositorio documental de la empresa · archivos en la nube vinculados a cada operación</div>
        </div>
        <div className="storage">
          <div className="storage__row"><span>Almacenamiento</span><span className="mono" style={{ color: 'var(--text-2)' }}>18.4 / 50 GB</span></div>
          <div className="meter"><div style={{ width: '37%', background: 'var(--accent)' }} /></div>
        </div>
      </div>

      <div className="toolbar" style={{ gap: 8 }}>
        {['Todos', ...CATEGORIES].map(c => (
          <button key={c} type="button" className={'filter-chip' + (cat === c ? ' is-on' : '')} aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c}
            <span className="filter-chip__count">{c === 'Todos' ? searched.length : searched.filter(d => d.cat === c).length}</span>
          </button>
        ))}
        <label className="search toolbar__search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre, orden o cliente" aria-label="Buscar documentos" />
        </label>
      </div>

      <section className="split" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px' }}>
        <div className="table">
          <div className="table__row table__head" style={{ gridTemplateColumns: COLS, gap: 10 }}>
            <span>Nombre</span><span>Relacionado con</span><span className="t-right">Tamaño</span><span className="t-right">Fecha</span><span />
          </div>
          {list.map(d => (
            <div
              key={d.id}
              role="row"
              tabIndex={0}
              className={'table__row table__body-row' + (d.id === sel?.id ? ' is-selected is-marked' : '')}
              style={{ gridTemplateColumns: COLS, gap: 10 }}
              onClick={() => setSelId(d.id)}
              onKeyDown={e => e.key === 'Enter' && setSelId(d.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <FileTag name={d.name} />
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{d.name}</div>
                  <div className="cell__sub">{d.cat} · {d.by}</div>
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--blue)', whiteSpace: 'nowrap' }}>{d.ref}</div>
                <div className="cell__sub">{d.entity}</div>
              </div>
              <span className="mono t-right" style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{d.size}</span>
              <span className="mono t-right" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{d.date}</span>
              <div className="row-actions"><button type="button" title="Descargar" onClick={e => e.stopPropagation()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
              </button></div>
            </div>
          ))}
          {list.length === 0 && <div className="table__empty">No hay documentos que coincidan.</div>}
          <div className="table__foot">{list.length} documentos</div>
        </div>

        <aside className="flowdetail">
          {sel && (
            <>
              <div className="preview"><span className="mono">vista previa del documento</span></div>
              <div className="flowdetail__body">
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <FileTag name={sel.name} />
                  <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{sel.name}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn--primary" style={{ flex: 1, height: 30 }}>Descargar</button>
                  <button type="button" className="btn" style={{ flex: 1, height: 30 }}>Compartir</button>
                  <button type="button" className="btn btn--danger-text" title="Eliminar" style={{ width: 30, height: 30, padding: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                  </button>
                </div>
                <div className="kv" style={{ gridTemplateColumns: '96px minmax(0, 1fr)', rowGap: 8, columnGap: 8 }}>
                  <span>Categoría</span><span>{sel.cat}</span>
                  <span>Relacionado</span><span><a className="mono" style={{ cursor: 'pointer' }}>{sel.ref}</a><br /><span style={{ color: 'var(--text-2)' }}>{sel.entity}</span></span>
                  <span>Tamaño</span><span className="mono">{sel.size}</span>
                  <span>Subido por</span><span>{sel.by}</span>
                  <span>Fecha</span><span className="mono">{sel.date}</span>
                  <span>Versión</span><span>{sel.version}</span>
                </div>
                <div className="flowdetail__items">
                  <span className="field__label">Acceso por rol</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(ROLES[sel.cat] ?? ['Gerencia']).map(r => <span key={r} className="chip chip--muted" style={{ fontWeight: 400 }}>{r}</span>)}
                  </div>
                </div>
                <div className="flowdetail__items">
                  <span className="field__label">Actividad</span>
                  {[
                    { who: sel.by, what: 'subió el documento', when: sel.date.slice(0, 6) },
                    { who: 'Rosa Medina', what: 'lo visualizó', when: sel.date.slice(0, 6) },
                    { who: 'Luis Paredes', what: 'lo descargó', when: '02 oct' },
                  ].map(a => (
                    <div key={a.what} className="history">
                      <span className="history__dot" style={{ background: 'var(--border-strong)' }} />
                      <div style={{ flex: 1 }}>{a.who} <span style={{ color: 'var(--muted)' }}>{a.what}</span></div>
                      <span className="mono" style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>{a.when}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </section>

      {uploading && (
        <UploadModal
          onClose={() => setUploading(false)}
          onUpload={d => {
            const id = 1000 + docs.length;
            setDocs(list => [{ ...d, id }, ...list]);
            setCat('Todos');
            setSelId(id);
            setUploading(false);
          }}
        />
      )}
    </AppShell>
  );
}
