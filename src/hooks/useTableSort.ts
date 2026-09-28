import { useState } from "react";

export type SortDir = "asc" | "desc";

/**
 * Click-to-sort state for a table. Unsorted until a header is clicked, so rows keep the order
 * they arrive in. A fresh column starts on its most useful end — `ascFirst` columns (names) A–Z,
 * the rest (numbers) largest first — and clicking the active column flips it.
 */
export function useTableSort<C extends string>(ascFirst: readonly C[] = []) {
  const [sort, setSort] = useState<{ column: C; dir: SortDir } | null>(null);

  const onSort = (column: C) =>
    setSort((prev) =>
      prev?.column === column
        ? { column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column, dir: ascFirst.includes(column) ? "asc" : "desc" },
    );

  /** Spread onto a `Th`. */
  const sortProps = (column: C) => ({
    sortDirection: sort?.column === column ? sort.dir : null,
    onSort: () => onSort(column),
  });

  return { sort, sortProps };
}
