import { describe, expect, it } from 'vitest';
import { cleanRow, cleanValue, toNumber } from './clean';
import { parseCsv } from './csv';
import { normalize, proposeMapping } from './match';
import { detectTable } from './detect';
import { readXlsxBook, sheetToGrid, unzip, writeXlsx } from './xlsx';

describe('parseCsv', () => {
    it('detecta punto y coma (Excel en español) y quita el BOM', () => {
        expect(parseCsv('﻿RUC;Razón social\n20123456789;APM SAC\n')).toEqual({ headers: ['RUC', 'Razón social'], rows: [['20123456789', 'APM SAC']] });
    });
    it('respeta comillas con comas, comillas dobles y saltos de línea', () => {
        expect(parseCsv('nombre,dir\n"Pérez, Juan","Av. ""Lima"" 123\nPiso 2"\n').rows).toEqual([['Pérez, Juan', 'Av. "Lima" 123\nPiso 2']]);
    });
    it('ignora filas vacías, recorta espacios y completa celdas faltantes', () => {
        expect(parseCsv('a,b,c\n 1 , 2 \n,,\n\n').rows).toEqual([['1', '2', '']]);
    });
});

const clientes = [
    { k: 'tdoc', label: 'Tipo de documento' }, { k: 'ndoc', label: 'N.º de documento' }, { k: 'razon', label: 'Razón social / nombre' },
    { k: 'dir', label: 'Dirección fiscal' }, { k: 'contacto', label: 'Persona de contacto' }, { k: 'tel', label: 'Teléfono' },
    { k: 'correo', label: 'Correo para comprobantes' }, { k: 'linea', label: 'Línea de crédito (S/)' }, { k: 'estado', label: 'Estado' },
];
const categorias = [{ k: 'nombre', label: 'Nombre' }, { k: 'padre', label: 'Categoría padre' }, { k: 'desc', label: 'Descripción' }];

describe('proposeMapping', () => {
    it('empareja sin importar tildes, mayúsculas ni orden', () => {
        expect(proposeMapping(['E-MAIL', 'Celular', 'NOMBRE O RAZÓN SOCIAL', 'Nro. Documento'], clientes, 'clientes'))
            .toEqual({ 0: 'correo', 1: 'tel', 2: 'razon', 3: 'ndoc' });
    });
    it('acepta las etiquetas exactas de la plantilla', () => {
        const map = proposeMapping(clientes.map(f => f.label), clientes, 'clientes');
        expect(Object.values(map)).toEqual(clientes.map(f => f.k));
    });
    it('deja sin emparejar lo desconocido y no usa un campo dos veces', () => {
        expect(proposeMapping(['Nombre', 'Cliente', 'Observaciones'], clientes, 'clientes')).toEqual({ 0: 'razon', 1: null, 2: null });
    });
    it('prefiere la etiqueta propia: «Descripción» va a descripción, no a nombre', () => {
        expect(proposeMapping(['Descripción', 'Categoría', 'Categoría padre'], categorias, 'categorias')).toEqual({ 0: 'desc', 1: 'nombre', 2: 'padre' });
    });
    it('normalize quita tildes, signos y palabras de relleno', () => {
        expect(normalize('  N.º  de Teléfono ')).toBe('telefono');
    });
});

describe('limpieza de valores', () => {
    it('números con formato peruano o inglés', () => {
        expect(toNumber('S/ 1.234,50')).toBe('1234.5');
        expect(toNumber('1,234.50')).toBe('1234.5');
        expect(toNumber('abc')).toBe('abc');
    });
    it('recupera el cero inicial de un DNI que Excel quitó', () => {
        expect(cleanValue('dni', '7251385')).toBe('07251385');
        expect(cleanRow('clientes', { tdoc: 'dni', ndoc: '7251385' })).toMatchObject({ tdoc: 'DNI', ndoc: '07251385' });
    });
    it('deduce el tipo de documento si no viene', () => {
        expect(cleanRow('clientes', { ndoc: '20123456789' }).tdoc).toBe('RUC');
        expect(cleanRow('clientes', { ndoc: '72513852' }).tdoc).toBe('DNI');
        // 7 dígitos sin tipo: podría ser un RUC incompleto, no se adivina.
        expect(cleanRow('clientes', { ndoc: '2055566' })).toEqual({ ndoc: '2055566' });
    });
    it('estado, IGV, condición de pago y tipo de almacén', () => {
        expect(cleanValue('estado', 'SI')).toBe('Activo');
        expect(cleanValue('estado', 'inactivo')).toBe('Inactivo');
        expect(cleanValue('igv', 'exonerado')).toBe('No');
        expect(cleanValue('cond', '30 días')).toBe('Crédito 30 días');
        expect(cleanValue('cond', 'CONTADO')).toBe('Contado');
        expect(cleanRow('almacenes', { tipo: 'secundario' }).tipo).toBe('Secundario');
        expect(cleanValue('placa', 'f3q 920')).toBe('F3Q-920');
        expect(cleanValue('placa', 'F3Q-920')).toBe('F3Q-920');
    });
});

/** ZIP mínimo sin compresión, para probar el lector de .xlsx sin depender de Excel. */
function zipStored(files: Record<string, string>): ArrayBuffer {
    const enc = new TextEncoder();
    const chunks: number[] = [], central: number[] = [];
    const le = (n: number, bytes: number) => Array.from({ length: bytes }, (_, i) => (n >>> (8 * i)) & 0xff);
    for (const [name, text] of Object.entries(files)) {
        const nb = [...enc.encode(name)], data = [...enc.encode(text)];
        const offset = chunks.length;
        chunks.push(...le(0x04034b50, 4), ...le(20, 2), 0, 0, 0, 0, 0, 0, 0, 0, ...le(0, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(nb.length, 2), 0, 0, ...nb, ...data);
        central.push(...le(0x02014b50, 4), ...le(20, 2), ...le(20, 2), 0, 0, 0, 0, 0, 0, 0, 0, ...le(0, 4), ...le(data.length, 4), ...le(data.length, 4),
            ...le(nb.length, 2), 0, 0, 0, 0, 0, 0, 0, 0, ...le(0, 4), ...le(offset, 4), ...nb);
    }
    const n = Object.keys(files).length;
    const end = [...le(0x06054b50, 4), 0, 0, 0, 0, ...le(n, 2), ...le(n, 2), ...le(central.length, 4), ...le(chunks.length, 4), 0, 0];
    return new Uint8Array([...chunks, ...central, ...end]).buffer;
}

describe('xlsx', () => {
    it('lee textos compartidos, números grandes y celdas salteadas', async () => {
        const files = await unzip(zipStored({
            'xl/sharedStrings.xml': '<sst><si><t>RUC</t></si><si><r><t>Razón </t></r><r><t>social</t></r></si><si><t>APM &amp; Cía</t></si></sst>',
            'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>'
                + '<row r="2"><c r="A2"><v>2.0123456789E10</v></c><c r="C2" t="s"><v>2</v></c></row></sheetData></worksheet>',
        }), n => n.startsWith('xl/'));
        const shared = [...files.get('xl/sharedStrings.xml')!.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t>([^<]*)<\/t>/g)].map(t => t[1]).join(''));
        const grid = sheetToGrid(files.get('xl/worksheets/sheet1.xml')!, shared.map(s => s.replace('&amp;', '&')));
        expect(grid).toEqual([['RUC', '', 'Razón social'], ['20123456789', '', 'APM & Cía']]);
    });
});

describe('libro con varias hojas', () => {
    it('la plantilla escrita se vuelve a leer igual, hoja por hoja', async () => {
        const blob = writeXlsx([
            { name: 'Clientes', rows: [['RUC', 'Razón social'], ['20123456789', 'APM & Cía <SAC>']] },
            { name: 'Productos', rows: [['SKU', 'Nombre'], ['A-1', 'Cemento']] },
            { name: 'Vacía', rows: [] },
        ]);
        const book = await readXlsxBook(await blob.arrayBuffer());
        expect(book.map(s => s.name)).toEqual(['Clientes', 'Productos']);
        expect(book[0].table).toEqual({ headers: ['RUC', 'Razón social'], rows: [['20123456789', 'APM & Cía <SAC>']] });
    });
});

describe('detectTable', () => {
    const F: Record<string, { k: string; label: string; required?: boolean }[]> = {
        clientes: clientes.map(f => ({ ...f, required: f.k === 'ndoc' || f.k === 'razon' })),
        conductores: [{ k: 'nombre', label: 'Nombre completo', required: true }, { k: 'dni', label: 'DNI', required: true }, { k: 'licencia', label: 'N.º de licencia', required: true }],
        vehiculos: [{ k: 'placa', label: 'Placa', required: true }, { k: 'tipo', label: 'Tipo de vehículo' }, { k: 'marca', label: 'Marca' }],
    };
    const fieldsOf = (t: string) => F[t] ?? [{ k: 'zzz', label: 'zzz', required: true }];
    it('por el nombre de la hoja', () => {
        expect(detectTable('CHOFERES', [], fieldsOf)).toBe('conductores');
        expect(detectTable('Precios por proveedor', [], fieldsOf)).toBe('preciosProv');
    });
    it('por las columnas si el nombre no dice nada', () => {
        expect(detectTable('Hoja1', ['Placa', 'Marca', 'Tipo'], fieldsOf)).toBe('vehiculos');
        expect(detectTable('Hoja2', ['Nombre completo', 'DNI', 'Brevete'], fieldsOf)).toBe('conductores');
    });
    it('reconoce la tabla aunque falte una columna obligatoria (la pantalla lo marca)', () => {
        expect(detectTable('Hoja4', ['Nombre completo', 'Brevete', 'Celular'], t => t === 'conductores'
            ? [...fieldsOf(t), { k: 'tel', label: 'Teléfono' }] : fieldsOf(t))).toBe('conductores');
    });
    it('null si no está claro', () => {
        expect(detectTable('Hoja3', ['Observaciones'], fieldsOf)).toBeNull();
    });
});