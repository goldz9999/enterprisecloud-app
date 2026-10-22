import { toTable, type Table } from './csv';

/**
 * Lector mínimo de .xlsx sin dependencias: un .xlsx es un ZIP con XML dentro.
 * Usa DecompressionStream (incluido en los navegadores) y lee solo la PRIMERA hoja como texto.
 * El archivo nunca sale del navegador.
 */

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    void writer.write(data as Uint8Array<ArrayBuffer>);
    void writer.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/** Contenido de cada archivo del ZIP, por nombre (solo los que se piden). */
export async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
    const b = new Uint8Array(buf);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
        if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('No es un archivo .xlsx válido');
    const count = u16(b, eocd + 10);
    let p = u32(b, eocd + 16);
    const out = new Map<string, string>();
    const dec = new TextDecoder('utf-8');
    for (let n = 0; n < count; n++) {
        if (u32(b, p) !== 0x02014b50) break;
        const method = u16(b, p + 10);
        const size = u32(b, p + 20);
        const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32);
        const local = u32(b, p + 42);
        const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
        p += 46 + nameLen + extraLen + commentLen;
        if (!wanted(name)) continue;
        const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
        const data = b.subarray(start, start + size);
        out.set(name, dec.decode(method === 8 ? await inflateRaw(data) : data));
    }
    return out;
}

const entities = (s: string) =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&amp;/g, '&');

/** Texto de todas las etiquetas <t> dentro de un fragmento (un texto con formato viene partido en varias). */
const texts = (xml: string) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => entities(m[1])).join('');

/** «AB12» → índice de columna 27. */
function colIndex(ref: string): number {
    let n = 0;
    for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
}

/** Números grandes que Excel guarda como 2.0123456789E10 → «20123456789». */
function numberText(v: string): string {
    if (!/e/i.test(v)) return v;
    const n = Number(v);
    return Number.isInteger(n) ? n.toFixed(0) : String(n);
}

export function sheetToGrid(sheetXml: string, shared: string[]): string[][] {
    const grid: string[][] = [];
    for (const row of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells: string[] = [];
        let next = 0;
        for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const attrs = c[1], body = c[2] ?? '';
            const ref = /\br="([A-Z]+)\d*"/.exec(attrs)?.[1];
            const i = ref ? colIndex(ref) : next;
            next = i + 1;
            const type = /\bt="(\w+)"/.exec(attrs)?.[1];
            const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
            let value = '';
            if (type === 's') value = shared[Number(v)] ?? '';
            else if (type === 'inlineStr') value = texts(body);
            else if (type === 'b') value = v === '1' ? 'Sí' : 'No';
            else if (v != null) value = type === 'str' ? entities(v) : numberText(v);
            cells[i] = value;
        }
        grid.push(Array.from(cells, c => c ?? ''));
    }
    return grid;
}

/** Rutas de las hojas del libro, en el orden en que aparecen, con su nombre visible. */
function sheetPaths(files: Map<string, string>): { name: string; path: string }[] {
    const wb = files.get('xl/workbook.xml') ?? '';
    const rels = files.get('xl/_rels/workbook.xml.rels') ?? '';
    const target = (rid: string) => {
        const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(r => r.includes(`Id="${rid}"`));
        const t = rel && /Target="([^"]+)"/.exec(rel)?.[1];
        return t ? (t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '')) : '';
    };
    return [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m, i) => ({
        name: entities(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? `Hoja${i + 1}`),
        path: target(/\br:id="([^"]+)"/.exec(m[0])?.[1] ?? '') || `xl/worksheets/sheet${i + 1}.xml`,
    }));
}

export interface Sheet {
    name: string;
    table: Table;
}

/** Todas las hojas del libro (se omiten las vacías). */
export async function readXlsxBook(file: File | ArrayBuffer): Promise<Sheet[]> {
    const files = await unzip('byteLength' in file ? file : await file.arrayBuffer(), n => n.startsWith('xl/'));
    const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
    const out: Sheet[] = [];
    for (const { name, path } of sheetPaths(files)) {
        const xml = files.get(path);
        if (!xml) continue;
        const table = toTable(sheetToGrid(xml, shared));
        if (table.headers.length) out.push({ name, table });
    }
    if (!out.length) throw new Error('El libro no tiene hojas con datos');
    return out;
}

/** Primera hoja del libro como tabla de texto. */
export async function readXlsxFile(file: File): Promise<Table> {
    return (await readXlsxBook(file))[0].table;
}

// ---------- escritura (plantilla) ----------

const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(b: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/** ZIP sin compresión (suficiente para una plantilla pequeña; Excel lo abre sin problema). */
function zip(files: [string, string][]): Uint8Array<ArrayBuffer> {
    const enc = new TextEncoder();
    const out: number[] = [], dir: number[] = [];
    const le = (n: number, bytes: number) => Array.from({ length: bytes }, (_, i) => (n >>> (8 * i)) & 0xff);
    for (const [name, text] of files) {
        const nb = enc.encode(name), data = enc.encode(text), crc = crc32(data), offset = out.length;
        const head = [...le(20, 2), ...le(0x0800, 2), 0, 0, 0, 0, 0, 0, ...le(crc, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(nb.length, 2), 0, 0];
        out.push(...le(0x04034b50, 4), ...head, ...nb, ...data);
        dir.push(...le(0x02014b50, 4), ...le(20, 2), ...head, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...le(offset, 4), ...nb);
    }
    const end = [...le(0x06054b50, 4), 0, 0, 0, 0, ...le(files.length, 2), ...le(files.length, 2), ...le(dir.length, 4), ...le(out.length, 4), 0, 0];
    return new Uint8Array([...out, ...dir, ...end]);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i: number): string => (i >= 26 ? colName(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

/** Libro .xlsx con una hoja por tabla (textos en línea, primera fila en negrita). */
export function writeXlsx(sheets: { name: string; rows: string[][] }[]): Blob {
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const sheetXml = (rows: string[][]) =>
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${ns}><cols>${(rows[0] ?? []).map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="24" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((r, y) =>
            `<row r="${y + 1}">${r.map((v, x) => `<c r="${colName(x)}${y + 1}" t="inlineStr"${y === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
    const files: [string, string][] = [
        ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
        ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
        ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns}><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
        ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
        ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
        ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)]),
    ];
    return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}