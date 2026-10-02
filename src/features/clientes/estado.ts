import type { Tone } from '../../components/StatusChip';
import type { EstadoCliente } from './types';

export const ESTADO_TONE: Record<EstadoCliente, Tone> = {
  Activo: 'green',
  Inactivo: 'muted',
};
