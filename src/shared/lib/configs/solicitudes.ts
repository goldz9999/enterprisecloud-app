import type { FlowListConfig } from '@/shared/components/flow-list/types';

export const solicitudes: FlowListConfig = {
  kind: "solicitud",
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
  notes: {
    Pendiente: "Requiere aprobación de Gerencia antes de comprar.",
    Aprobada: "Aprobada. Al generar la orden de compra se elige el proveedor (de Mantenimiento) y se fijan costos y fecha de entrega.",
    Atendida: "Ya tiene una orden de compra asociada.",
    Rechazada: "No procede. El solicitante fue notificado."
  },
};