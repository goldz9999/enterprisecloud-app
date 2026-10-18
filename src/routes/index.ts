import type { ReactNode } from 'react';
import { cotizaciones } from '@/shared/lib/configs/cotizaciones';
import { solicitudes } from '@/shared/lib/configs/solicitudes';
import { RECORD_PAGES } from '@/shared/lib/configs';

export interface RouteConfig {
  path: string;
  module: string;
  el: ReactNode;
}

export { RECORD_PAGES };
export { cotizaciones, solicitudes };
