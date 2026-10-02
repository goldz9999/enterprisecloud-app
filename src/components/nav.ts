export interface NavChild {
  label: string;
  to: string;
  badge?: string;
}

export interface NavItem {
  kind: 'item';
  label: string;
  /** SVG path data for the 24×24 stroke icon. */
  icon: string;
  to?: string;
  badge?: string;
  /** Red attention dot (e.g. critical stock). */
  dot?: boolean;
  children?: NavChild[];
}

export interface NavSection {
  kind: 'section';
  label: string;
}

export type NavEntry = NavItem | NavSection;

export const NAV: NavEntry[] = [
  { kind: 'item', label: 'Dashboard', to: '/', icon: 'M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { kind: 'section', label: 'Operaciones' },
  {
    kind: 'item', label: 'Ventas',
    icon: 'M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6M7.5 20a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M16.5 20a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
    children: [
      { label: 'Cotizaciones', to: '/ventas/cotizaciones', badge: '2' },
      { label: 'Órdenes de venta', to: '/ventas/ordenes', badge: '23' },
      { label: 'Comprobantes', to: '/ventas/comprobantes' },
    ],
  },
  {
    kind: 'item', label: 'Compras', icon: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
    children: [
      { label: 'Solicitudes', to: '/compras/solicitudes', badge: '2' },
      { label: 'Órdenes de compra', to: '/compras/ordenes', badge: '5' },
      { label: 'Recepción', to: '/compras/recepcion' },
    ],
  },
  {
    kind: 'item', label: 'Inventario', dot: true, icon: 'M3 21V8l9-5 9 5v13M7 21v-8h10v8M7 17h10',
    children: [
      { label: 'Stock por almacén', to: '/inventario/stock', badge: '7' },
      { label: 'Kardex', to: '/inventario/kardex' },
      { label: 'Transferencias', to: '/inventario/transferencias' },
      { label: 'Ajustes', to: '/inventario/ajustes' },
    ],
  },
  {
    kind: 'item', label: 'Finanzas', icon: 'M3 3v18h18M8 17v-5M13 17V8M18 17V5',
    children: [
      { label: 'Cuentas por cobrar', to: '/finanzas/cxc' },
      { label: 'Cuentas por pagar', to: '/finanzas/cxp' },
      { label: 'Caja', to: '/finanzas/caja' },
      { label: 'Bancos', to: '/finanzas/bancos' },
    ],
  },
  { kind: 'item', label: 'Documentos', to: '/documentos', icon: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5' },
  { kind: 'item', label: 'Reportes', to: '/reportes', icon: 'M21 12A9 9 0 1 1 12 3v9zM15 3.5A9 9 0 0 1 20.5 9H15z' },
  { kind: 'section', label: 'Mantenimiento' },
  {
    kind: 'item', label: 'Mantenimiento',
    icon: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    children: [
      { label: 'Clientes', to: '/mantenimiento/clientes' },
      { label: 'Proveedores', to: '/mantenimiento/proveedores' },
      { label: 'Productos', to: '/mantenimiento/productos' },
      { label: 'Categorías', to: '/mantenimiento/categorias' },
      { label: 'Almacenes', to: '/mantenimiento/almacenes' },
    ],
  },
  { kind: 'section', label: 'Sistema' },
  {
    kind: 'item', label: 'Administración', icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
    children: [
      { label: 'Usuarios', to: '/admin/usuarios' },
      { label: 'Roles', to: '/admin/roles' },
      { label: 'Permisos', to: '/admin/permisos' },
      { label: 'Auditoría', to: '/admin/auditoria' },
    ],
  },
  {
    kind: 'item', label: 'Configuración', to: '/configuracion',
    icon: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M12 2v3M12 19v3M4.9 4.9L7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1',
  },
];

