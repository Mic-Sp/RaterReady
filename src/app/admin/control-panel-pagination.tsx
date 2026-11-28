import Link from "next/link";

/** Server-rendered paging keeps active filters and provides separate Previous and Next landmarks. */
export function ControlPanelPagination({ path, params, page, pages }: { path: string; params: Record<string, string>; page: number; pages: number }) {
  if (pages < 2) return null;
  const href = (number: number) => `${path}?${new URLSearchParams({ ...params, page: String(number) })}`;
  return <nav className="control-panel-pagination" aria-label="Results pages">
    {page > 1 && <Link className="inline-link" href={href(page - 1)} rel="prev">Previous page</Link>}
    <p>Page {page} of {pages}</p>
    {page < pages && <Link className="inline-link" href={href(page + 1)} rel="next">Next page</Link>}
  </nav>;
}
