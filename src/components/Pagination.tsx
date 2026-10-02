interface PaginationProps {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}

/** "‹ Anterior · 1 2 3 · Siguiente ›" — right-aligned inside a .pager footer. */
export function Pagination({ page, pages, onPage }: PaginationProps) {
  return (
    <div className="pager__pages">
      <button type="button" className="pager__nav" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>‹ Anterior</button>
      {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
        <button key={p} type="button" className={'pager__num mono' + (p === page ? ' is-on' : '')} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>
          {p}
        </button>
      ))}
      <button type="button" className="pager__nav" disabled={page >= pages} onClick={() => onPage(Math.min(pages, page + 1))}>Siguiente ›</button>
    </div>
  );
}
