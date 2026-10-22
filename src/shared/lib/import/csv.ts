/** Tabla leída de un archivo: la primera fila son los encabezados. Todo como texto. */
export interface Table {
    headers: string[];
    rows: string[][];
}

/** Separador más probable mirando la primera línea (Excel en español guarda los CSV con «;»). */
function detectSeparator(firstLine: string): string {
    const count = (c: string) => firstLine.split(c).length - 1;
    return [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
}

/** Recorta espacios, quita filas vacías y separa encabezados de datos. */
export function toTable(grid: string[][]): Table {
    const clean = grid.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(Boolean));
    const [headers = [], ...rows] = clean;
    const width = headers.length;
    return { headers, rows: rows.map(r => Array.from({ length: Math.max(width, r.length) }, (_, i) => r[i] ?? '')) };
}

/** CSV según RFC 4180: comillas, comillas dobles escapadas y saltos de línea dentro de comillas. */
export function parseCsv(input: string): Table {
    const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const sep = detectSeparator(text.split('\n', 1)[0] ?? '');
    const out: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === sep) { row.push(cell); cell = ''; }
        else if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
        else cell += ch;
    }
    if (cell || row.length) { row.push(cell); out.push(row); }
    return toTable(out);
}

/** Lee el archivo como UTF-8; si aparecen caracteres inválidos (CSV de un Excel antiguo), lo relee como Windows-1252. */
export async function readCsvFile(file: File): Promise<Table> {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    return parseCsv(text);
}