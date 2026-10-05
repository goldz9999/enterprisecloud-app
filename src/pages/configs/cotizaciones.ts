import type { FlowListConfig } from '../../features/flowlist/types';

export const cotizaciones: FlowListConfig = {
  kind: "cotizacion",
  active: "Cotizaciones",
  section: "Ventas",
  title: "Cotizaciones",
  subtitle: "Propuestas de precio enviadas a clientes. Una cotización aprobada se convierte en orden de venta.",
  newLabel: "Nueva cotización",
  partyHead: "Cliente",
  amountHead: "Total",
  searchPh: "Código o cliente",
  flow: [
    "Cotización",
    "Orden de venta",
    "Despacho",
    "Comprobante",
    "Cobro"
  ],
  statuses: {
    Borrador: "blue",
    Enviada: "amber",
    Aprobada: "green",
    Convertida: "blue",
    Rechazada: "red"
  },
  notes: {
    Borrador: "Aún no se envía al cliente. Puedes editar precios y cantidades.",
    Enviada: "Esperando respuesta del cliente. Válida hasta la fecha de vencimiento.",
    Aprobada: "El cliente aceptó. Al convertirla se crea la orden de venta con el mismo cliente, productos y precios, y se reserva el stock.",
    Convertida: "Ya generó una orden de venta. No se puede editar.",
    Rechazada: "El cliente no aceptó la propuesta."
  },
  rows: [
    {id: "COT-2026-0318", date: "28 sep 2026", party: "Constructora Pacífico E.I.R.L.", partySub: "RUC 20601122334", status: "Aprobada", items: [{name: "Cemento Portland Tipo I 42.5 kg", qty: 170, unit: "bolsa", price: 28.5}, {name: "Fierro corrugado 1/2\" x 9 m", qty: 60, unit: "varilla", price: 41.2}, {name: "Clavos para madera 3\"", qty: 25, unit: "kg", price: 9.71}], facts: [{k: "Vendedor", v: "Luis Paredes"}, {k: "Válida hasta", v: "12 oct 2026"}, {k: "Condición", v: "Crédito 30 días"}, {k: "Entrega", v: "Almacén Callao"}]},
    {id: "COT-2026-0321", date: "01 oct 2026", party: "Agroexportadora Ica S.A.C.", partySub: "RUC 20577889900", status: "Enviada", items: [{name: "Tubo PVC 4\" x 3 m clase 10", qty: 80, unit: "unidad", price: 36.9}, {name: "Pegamento PVC 1/4 gal", qty: 20, unit: "unidad", price: 24.5}], facts: [{k: "Vendedor", v: "Luis Paredes"}, {k: "Válida hasta", v: "15 oct 2026"}, {k: "Condición", v: "Contado"}, {k: "Entrega", v: "Almacén Lima"}]},
    {id: "COT-2026-0322", date: "02 oct 2026", party: "Clínica San Gabriel S.A.", partySub: "RUC 20144556677", status: "Borrador", items: [{name: "Guantes de nitrilo talla M x100", qty: 40, unit: "caja", price: 24.6}, {name: "Casco de seguridad ANSI", qty: 15, unit: "unidad", price: 18.4}], facts: [{k: "Vendedor", v: "María Rojas"}, {k: "Válida hasta", v: "16 oct 2026"}, {k: "Condición", v: "Crédito 15 días"}, {k: "Entrega", v: "Almacén Lima"}]},
    {id: "COT-2026-0316", date: "25 sep 2026", party: "Minera Los Andes S.A.", partySub: "RUC 20100987652", status: "Convertida", order: "OV-2026-1282", items: [{name: "Fierro corrugado 1/2\" x 9 m", qty: 400, unit: "varilla", price: 41.2}, {name: "Cable THW 12 AWG x 100 m", qty: 12, unit: "rollo", price: 189}], facts: [{k: "Vendedor", v: "Luis Paredes"}, {k: "Válida hasta", v: "09 oct 2026"}, {k: "Condición", v: "Crédito 45 días"}, {k: "Orden generada", v: "OV-2026-1282"}]},
    {id: "COT-2026-0319", date: "29 sep 2026", party: "Textil Arequipa S.R.L.", partySub: "RUC 20455667788", status: "Enviada", items: [{name: "Pintura látex blanco 4 L", qty: 60, unit: "galón", price: 52.3}], facts: [{k: "Vendedor", v: "María Rojas"}, {k: "Válida hasta", v: "13 oct 2026"}, {k: "Condición", v: "Crédito 30 días"}, {k: "Entrega", v: "Almacén Lima"}]},
    {id: "COT-2026-0311", date: "20 sep 2026", party: "Inversiones Cusco Plaza S.A.C.", partySub: "RUC 20522334455", status: "Rechazada", items: [{name: "Ladrillo King Kong 18 huecos", qty: 6000, unit: "unidad", price: 0.92}], facts: [{k: "Vendedor", v: "Luis Paredes"}, {k: "Válida hasta", v: "04 oct 2026"}, {k: "Condición", v: "Contado"}, {k: "Motivo", v: "Precio fuera de presupuesto"}]}
  ]
};
