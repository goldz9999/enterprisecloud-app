import { useCallback, useState } from 'react';
import { CLIENTES_SEED } from './data';
import type { Cliente, ClienteInput } from './types';

/**
 * In-memory client store. Swap the bodies for API calls when the backend exists;
 * the page only depends on this hook's shape.
 */
export function useClientes() {
  const [clientes, setClientes] = useState<Cliente[]>(CLIENTES_SEED);
  const [seq, setSeq] = useState(CLIENTES_SEED.length);

  const create = useCallback(
    (input: ClienteInput): Cliente => {
      const next = seq + 1;
      const cliente: Cliente = { ...input, id: 1000 + next, codigo: 'CLI-' + String(318 + next).padStart(6, '0') };
      setSeq(next);
      setClientes(list => [cliente, ...list]);
      return cliente;
    },
    [seq],
  );

  const update = useCallback((id: number, input: ClienteInput) => {
    setClientes(list => list.map(c => (c.id === id ? { ...c, ...input } : c)));
  }, []);

  const remove = useCallback((id: number) => {
    setClientes(list => list.filter(c => c.id !== id));
  }, []);

  return { clientes, create, update, remove };
}
