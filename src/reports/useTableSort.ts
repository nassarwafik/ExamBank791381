import { useState } from "react";
import { nextSort, type SortState } from "./tableTools";

/** Phase R-5b — the sort state of one table and the click handler of its headers (the cycle of tableTools.nextSort). */
export function useTableSort() {
  const [sort, setSort] = useState<SortState>(null);
  return { sort, toggle: (key: string, numeric: boolean) => setSort(current => nextSort(current, key, numeric)) };
}
