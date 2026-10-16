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
    Rechazada: "red",
    Vencida: "muted"
  },
  notes: {
    Borrador: "Puedes editar precios y cantidades. Márcala como aprobada o rechazada según la respuesta del cliente.",
    Enviada: "Esperando respuesta del cliente. Válida hasta la fecha de vencimiento.",
    Convertida: "Ya generó una orden de venta. No se puede editar.",
    Rechazada: "El cliente no aceptó la propuesta.",
    Vencida: "Pasó la fecha de validez y ya no se puede aprobar ni convertir. Extiende la vigencia o duplícala como nueva cotización."
  },
};