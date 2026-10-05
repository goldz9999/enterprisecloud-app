import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Modal } from '../components/Modal';
import type { Tone } from '../components/StatusChip';
import { Toast, useToast } from '../components/Toast';
import { audit } from '../data/domain/audit';
import { deleteFile, getFile, putFile } from '../data/files';
import { can } from '../data/permissions';
import { currentUser, getDB, mutate, nextId, useDB } from '../data/store';
import type { DocFile } from '../data/types';
import { downloadBlob, openPrintable } from '../lib/csv';
import { displayDate, fmtDayMonth } from '../lib/dates';
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
const MAX_BYTES = 25 * 1024 * 1024;

const extOf = (name: string) => (name.split('.').pop() ?? '').toUpperCase();
const humanSize = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const COLS = 'minmax(0, 1.6fr) minmax(0, 1.2fr) 64px 76px 32px';

function FileTag({ name }: { name: string }) {
  const ext = extOf(name);
  return <span className={'filetag chip--' + (EXT_TONE[ext] ?? 'muted')}>{ext}</span>;
}

/** Placeholder printable page for sample documents that have no real file. */
const samplePage = (doc: DocFile) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${doc.name}</title></head><body style="font:14px system-ui;margin:48px"><h2>${doc.name}</h2><p>${doc.cat} · ${doc.ref} · ${doc.entity}</p><p style="color:#666">Documento de ejemplo: no tiene archivo adjunto. Sube tus propios archivos con "Subir documento".</p></body></html>`;

function UploadModal({ onClose, onUpload, defaultRef }: { onClose: () => void; onUpload: (file: File, cat: string, ref: string) => void; defaultRef: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [cat, setCat] = useState('Facturas');
  const [ref, setRef] = useState(defaultRef);
  const [error, setError] = useState('');

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return setError('El archivo supera los 25 MB.');
    setError('');
    setFile(f);
  };

  return (
    <Modal
      title="Subir documento"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" style={{ height: 30 }} onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn--primary" style={{ height: 30, padding: '0 14px', opacity: file ? 1 : 0.5 }} disabled={!file} onClick={() => file && onUpload(file, cat, ref.trim())}>
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
      {error && <div className="drawer-error">{error}</div>}
      <label className="field">
        <span className="field__label">Categoría</span>
        <select className="field__control" style={{ height: 32 }} value={cat} onChange={e => setCat(e.target.value)}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Relacionar con operación</span>
        <input className="field__control mono" style={{ height: 32, fontSize: 12, padding: '0 10px' }} value={ref} onChange={e => setRef(e.target.value)} placeholder="Ej. OV-2026-1284, OC-2026-0412, CLI-000245" />
      </label>
      <div style={{ fontSize: 12, color: 'var(--faint)' }}>El archivo se guarda en este navegador.</div>
    </Modal>
  );
}

/** Finds who/what an operation code refers to, for the "Relacionado" column. */
function entityOf(ref: string): string {
  const d = getDB();
  const o = d.orders.find(x => x.code === ref);
  if (o) return o.party.name;
  const c = d.records.clientes.find(x => x.cod === ref) ?? d.records.proveedores.find(x => x.cod === ref);
  if (c) return String(c.razon);
  return ref ? 'Operación vinculada' : '—';
}

export function DocumentosPage() {
  const d = useDB();
  const [params] = useSearchParams();
  const [cat, setCat] = useState('Todos');
  const [query, setQuery] = useState(params.get('q') ?? '');
  // Follow ?q= when arriving from the global search or a link while already on this screen.
  useEffect(() => setQuery(params.get('q') ?? ''), [params]);
  const [selId, setSelId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useToast();
  const canCreate = can(d, 'Documentos', 'Crear');
  const canRemove = can(d, 'Documentos', 'Eliminar');

  const docs = d.documentos;
  const q = query.trim().toLowerCase();
  const searched = docs.filter(x => !q || (x.name + x.ref + x.entity).toLowerCase().includes(q));
  const list = cat === 'Todos' ? searched : searched.filter(x => x.cat === cat);
  const sel = docs.find(x => x.id === selId) ?? list[0];
  const activity = sel ? d.audit.filter(e => e.ref === sel.name).slice(0, 6) : [];
  // Storage use: real uploaded bytes are unknown without reading IndexedDB; estimate from the listed sizes.
  const usedMb = docs.reduce((a, x) => a + (x.size.endsWith('MB') ? parseFloat(x.size) : parseFloat(x.size) / 1024), 0);

  const download = async (doc: DocFile) => {
    if (doc.blobKey) {
      const blob = await getFile(doc.blobKey).catch(() => undefined);
      if (!blob) return toast.flash('No se encontró el archivo en este navegador');
      downloadBlob(doc.name, blob);
    } else {
      openPrintable(doc.html ?? samplePage(doc));
    }
    mutate(dr => audit(dr, { action: 'Descargar', module: 'Documentos', ref: doc.name, desc: `Descarga de ${doc.cat.toLowerCase()}` }));
  };

  const share = async (doc: DocFile) => {
    const text = `${doc.name} · ${doc.cat} · ${doc.ref} (${doc.entity})`;
    try {
      await navigator.clipboard.writeText(text);
      toast.flash('Datos del documento copiados al portapapeles');
    } catch {
      toast.flash(text);
    }
  };

  const remove = async (doc: DocFile) => {
    if (doc.blobKey) await deleteFile(doc.blobKey).catch(() => {});
    mutate(dr => {
      dr.documentos = dr.documentos.filter(x => x.id !== doc.id);
      audit(dr, { action: 'Eliminar', module: 'Documentos', ref: doc.name, desc: 'Documento eliminado' });
    });
    setConfirmDelete(false);
    setSelId(null);
    toast.flash('Documento eliminado');
  };

  const upload = async (file: File, category: string, ref: string) => {
    const id = nextId(getDB().documentos.map(x => ({ _id: x.id })));
    const blobKey = `doc-${Date.now()}-${id}`;
    try {
      await putFile(blobKey, file);
    } catch {
      return toast.flash('No se pudo guardar el archivo en este navegador');
    }
    mutate(dr => {
      dr.documentos.unshift({ id, name: file.name, cat: category, ref: ref || 'Sin vincular', entity: entityOf(ref), size: humanSize(file.size), date: new Date().toISOString(), by: currentUser(dr).name, version: 'v1 · actual', blobKey });
      audit(dr, { action: 'Crear', module: 'Documentos', ref: file.name, desc: `Documento subido · ${category}` });
    });
    setCat('Todos');
    setQuery('');
    setSelId(id);
    setUploading(false);
    toast.flash('Documento subido');
  };

  return (
    <AppShell
      active="Documentos"
      breadcrumb={[{ label: 'Inicio', to: '/' }, { label: 'Documentos' }]}
      actions={
        canCreate && (
          <button type="button" className="btn btn--primary" onClick={() => setUploading(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16" /></svg>
            Subir documento
          </button>
        )
      }
    >
      <div className="page-head">
        <div>
          <h1 className="page__title">Documentos</h1>
          <div className="page__subtitle">Repositorio documental de la empresa · archivos vinculados a cada operación, guardados en este navegador</div>
        </div>
        <div className="storage">
          <div className="storage__row"><span>Almacenamiento</span><span className="mono" style={{ color: 'var(--text-2)' }}>{usedMb.toFixed(1)} MB · {docs.length} archivos</span></div>
          <div className="meter"><div style={{ width: Math.min(100, (usedMb / 500) * 100) + '%', background: 'var(--accent)' }} /></div>
        </div>
      </div>

      <div className="toolbar" style={{ gap: 8 }}>
        {['Todos', ...CATEGORIES].map(c => (
          <button key={c} type="button" className={'filter-chip' + (cat === c ? ' is-on' : '')} aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c}
            <span className="filter-chip__count">{c === 'Todos' ? searched.length : searched.filter(x => x.cat === c).length}</span>
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
          {list.map(x => (
            <div
              key={x.id}
              role="row"
              tabIndex={0}
              className={'table__row table__body-row' + (x.id === sel?.id ? ' is-selected is-marked' : '')}
              style={{ gridTemplateColumns: COLS, gap: 10 }}
              onClick={() => { setSelId(x.id); setConfirmDelete(false); }}
              onKeyDown={e => e.key === 'Enter' && setSelId(x.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <FileTag name={x.name} />
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500 }}>{x.name}</div>
                  <div className="cell__sub">{x.cat} · {x.by}</div>
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--blue)', whiteSpace: 'nowrap' }}>{x.ref}</div>
                <div className="cell__sub">{x.entity}</div>
              </div>
              <span className="mono t-right" style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{x.size}</span>
              <span className="mono t-right" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDayMonth(new Date(x.date))}</span>
              <div className="row-actions">
                <button type="button" title="Descargar" onClick={e => { e.stopPropagation(); download(x); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
                </button>
              </div>
            </div>
          ))}
          {list.length === 0 && <div className="table__empty">{docs.length ? 'No hay documentos que coincidan.' : 'Aún no hay documentos. Se generan al despachar, facturar o recibir, o puedes subirlos.'}</div>}
          <div className="table__foot">{list.length} documentos</div>
        </div>

        <aside className="flowdetail">
          {sel ? (
            <>
              <div className="preview"><span className="mono">{sel.blobKey ? 'archivo subido' : sel.html ? 'documento generado' : 'documento de ejemplo'}</span></div>
              <div className="flowdetail__body">
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <FileTag name={sel.name} />
                  <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{sel.name}</div>
                </div>
                {confirmDelete ? (
                  <div className="confirm-del">
                    <span className="confirm-del__text">¿Eliminar este documento?</span>
                    <button type="button" className="confirm-del__no" onClick={() => setConfirmDelete(false)}>No</button>
                    <button type="button" className="confirm-del__yes" onClick={() => remove(sel)}>Sí, eliminar</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn--primary" style={{ flex: 1, height: 30 }} onClick={() => download(sel)}>{sel.blobKey ? 'Descargar' : 'Ver / imprimir'}</button>
                    <button type="button" className="btn" style={{ flex: 1, height: 30 }} onClick={() => share(sel)}>Copiar datos</button>
                    {canRemove && (
                      <button type="button" className="btn btn--danger-text" title="Eliminar" aria-label="Eliminar documento" style={{ width: 30, height: 30, padding: 0 }} onClick={() => setConfirmDelete(true)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                      </button>
                    )}
                  </div>
                )}
                <div className="kv" style={{ gridTemplateColumns: '96px minmax(0, 1fr)', rowGap: 8, columnGap: 8 }}>
                  <span>Categoría</span><span>{sel.cat}</span>
                  <span>Relacionado</span>
                  <span>
                    {/^O[VC]-/.test(sel.ref) ? <Link className="mono" to={`/${sel.ref.startsWith('OV') ? 'ventas' : 'compras'}/orden/${sel.ref}`}>{sel.ref}</Link> : <span className="mono">{sel.ref}</span>}
                    <br /><span style={{ color: 'var(--text-2)' }}>{sel.entity}</span>
                  </span>
                  <span>Tamaño</span><span className="mono">{sel.size}</span>
                  <span>Subido por</span><span>{sel.by}</span>
                  <span>Fecha</span><span className="mono">{displayDate(sel.date)}</span>
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
                  <div className="history">
                    <span className="history__dot" style={{ background: 'var(--border-strong)' }} />
                    <div style={{ flex: 1 }}>{sel.by} <span style={{ color: 'var(--muted)' }}>{sel.by === 'Sistema' ? 'generó el documento' : 'subió el documento'}</span></div>
                    <span className="mono" style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>{fmtDayMonth(new Date(sel.date))}</span>
                  </div>
                  {activity.filter(a => a.action !== 'Crear').map(a => (
                    <div key={a.id} className="history">
                      <span className="history__dot" style={{ background: 'var(--border-strong)' }} />
                      <div style={{ flex: 1 }}>{a.user} <span style={{ color: 'var(--muted)' }}>{a.action === 'Descargar' ? 'lo descargó' : a.desc.toLowerCase()}</span></div>
                      <span className="mono" style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>{fmtDayMonth(new Date(a.at))}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flowdetail__body" style={{ color: 'var(--muted)' }}>Selecciona un documento.</div>
          )}
        </aside>
      </section>

      {uploading && <UploadModal onClose={() => setUploading(false)} onUpload={upload} defaultRef={/^O[VC]-|^CLI-|^PRV-/.test(query) ? query : ''} />}
      <Toast message={toast.message} />
    </AppShell>
  );
}

