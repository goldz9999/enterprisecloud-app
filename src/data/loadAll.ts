import { refreshSession } from './domain/auth';
import { loadAdmin } from './domain/admin';
import { loadMasters } from './domain/masters';
import { loadSaleOrders } from './domain/salesOrders';
import { loadQuotations } from './domain/quotations';
import { loadInvoices } from './domain/invoices';
import { loadPurchaseRequests } from './domain/purchaseRequests';
import { loadPurchaseOrders } from './domain/purchaseOrders';
import { loadGoodsReceipts } from './domain/goodsReceipts';
import { loadInventory } from './domain/inventory';
import { loadFinance } from './domain/finance';

/** Descarga del backend todo lo que usan las pantallas. Se llama al iniciar sesión y desde "Reintentar". */
export function loadAll() {
  void refreshSession();
  // Mantenimiento, Administración y órdenes de venta se leen del backend (Supabase).
  void loadMasters();
  void loadAdmin();
  void loadSaleOrders();
  void loadQuotations();
  void loadInvoices();
  void loadPurchaseRequests();
  void loadPurchaseOrders();
  void loadGoodsReceipts();
  void loadInventory();
  void loadFinance();
}
