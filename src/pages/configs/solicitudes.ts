import type { FlowListConfig } from '../../features/flowlist/types';

export const solicitudes: FlowListConfig = {
  active: "Solicitudes",
  section: "Compras",
  title: "Solicitudes de compra",
  subtitle: "Pedidos internos de las áreas. Una solicitud aprobada se convierte en orden de compra al proveedor.",
  newLabel: "Nueva solicitud",
  partyHead: "Solicitante · área",
  amountHead: "Estimado",
  searchPh: "Código, área o solicitante",
  flow: [
    "Solicitud",
    "Orden de compra",
    "Recepción",
    "Factura proveedor",
    "Pago"
  ],
  statuses: {
    Pendiente: "amber",
    Aprobada: "green",
    Atendida: "blue",
    Rechazada: "red"
  },
  actions: {
    Pendiente: [
      {
        label: "Aprobar solicitud",
        to: "Aprobada",
        primary: true
      },
      {
        label: "Rechazar",
        to: "Rechazada",
        danger: true
      }
    ],
    Aprobada: [
      {
        label: "Generar orden de compra →",
        href: "/compras/orden?paso=1",
        primary: true
      }
    ],
    Atendida: [
      {
        label: "Ver orden de compra OC-2026-0412",
        href: "/compras/orden"
      }
    ],
    Rechazada: []
  },
  notes: {
    Pendiente: "Requiere aprobación de Gerencia antes de comprar.",
    Aprobada: "Aprobada. Al generar la orden de compra se elige el proveedor (de Mantenimiento) y se fijan costos y fecha de entrega.",
    Atendida: "Ya tiene una orden de compra asociada.",
    Rechazada: "No procede. El solicitante fue notificado."
  },
  rows: [
    {id: "SOL-2026-0087", date: "27 sep 2026", party: "Jorge Quispe", partySub: "Almacén · Reposición por stock bajo mínimo", status: "Aprobada", items: [{name: "Fierro corrugado 1/2\" x 9 m", qty: 300, unit: "varilla", price: 34.8}, {name: "Alambre negro recocido N.º 16", qty: 150, unit: "kg", price: 5.4}, {name: "Clavos para madera 3\"", qty: 120, unit: "kg", price: 7.9}], facts: [{k: "Prioridad", v: "Alta"}, {k: "Requerido para", v: "03 oct 2026"}, {k: "Almacén destino", v: "Almacén Lima"}, {k: "Proveedor sugerido", v: "Aceros del Sur S.A.C."}]},
    {id: "SOL-2026-0089", date: "01 oct 2026", party: "Carlos Huamán", partySub: "Almacén · Stock crítico cemento", status: "Pendiente", items: [{name: "Cemento Portland Tipo I 42.5 kg", qty: 500, unit: "bolsa", price: 22.1}], facts: [{k: "Prioridad", v: "Alta"}, {k: "Requerido para", v: "05 oct 2026"}, {k: "Almacén destino", v: "Almacén Lima"}, {k: "Proveedor sugerido", v: "Cementos Pacasmayo Dist."}]},
    {id: "SOL-2026-0090", date: "02 oct 2026", party: "Ana Torres", partySub: "Compras · EPP trimestral", status: "Pendiente", items: [{name: "Guantes de nitrilo talla M x100", qty: 60, unit: "caja", price: 17.2}, {name: "Casco de seguridad ANSI", qty: 40, unit: "unidad", price: 12.9}], facts: [{k: "Prioridad", v: "Media"}, {k: "Requerido para", v: "15 oct 2026"}, {k: "Almacén destino", v: "Almacén Callao"}, {k: "Proveedor sugerido", v: "EPP Seguridad Total"}]},
    {id: "SOL-2026-0084", date: "22 sep 2026", party: "Jorge Quispe", partySub: "Almacén · Tubería PVC", status: "Atendida", items: [{name: "Tubo PVC 4\" x 3 m clase 10", qty: 120, unit: "unidad", price: 27.5}], facts: [{k: "Prioridad", v: "Media"}, {k: "Requerido para", v: "29 sep 2026"}, {k: "Almacén destino", v: "Almacén Callao"}, {k: "Orden generada", v: "OC-2026-0409"}]},
    {id: "SOL-2026-0082", date: "19 sep 2026", party: "Rosa Medina", partySub: "Finanzas · Mobiliario de oficina", status: "Rechazada", items: [{name: "Silla ergonómica", qty: 6, unit: "unidad", price: 420}], facts: [{k: "Prioridad", v: "Baja"}, {k: "Requerido para", v: "30 oct 2026"}, {k: "Motivo", v: "Fuera de presupuesto Q4"}, {k: "Revisó", v: "María Rojas"}]}
  ]
};
