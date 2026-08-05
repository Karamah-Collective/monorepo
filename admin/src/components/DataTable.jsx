import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

// Shared table for every admin page: global search, per-column filters,
// multi-column sort (shift-click a header for a secondary sort key),
// pagination. Columns opt into special cell rendering via
// `column.meta.cellType` ("select" | "boolean" | "actions") and per-column
// filter UI via `column.meta.filterVariant` ("text" default | "select").
export default function DataTable({ data, columns, getRowId, emptyMessage = "No rows to show.", pageSize = 25 }) {
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    enableMultiSort: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;

  return (
    <div>
      <div className="pp-table-toolbar">
        <input
          className="pp-table-search"
          type="search"
          placeholder="Search everything…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
        />
        <span className="pp-table-count">
          {table.getFilteredRowModel().rows.length} of {data.length} rows
        </span>
      </div>

      <div className="pp-table-wrap">
        <table className="pp-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={header.column.getIsSorted() ? "pp-th-sorted" : ""}
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <div className="pp-th-label">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted()] || ""}
                    </div>
                    {header.column.getCanFilter() && (
                      <ColumnFilter column={header.column} />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="pp-empty-state" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {table.getPageCount() > 1 && (
          <div className="pp-table-pagination">
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              ← Prev
            </button>
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ColumnFilter({ column }) {
  const variant = column.columnDef.meta?.filterVariant || "text";
  const options = column.columnDef.meta?.options;
  const value = column.getFilterValue() ?? "";

  const optionList = useMemo(() => options || [], [options]);

  if (variant === "select") {
    return (
      <select className="pp-col-filter" value={value} onChange={(e) => column.setFilterValue(e.target.value || undefined)}>
        <option value="">All</option>
        {optionList.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className="pp-col-filter"
      type="text"
      placeholder="Filter…"
      value={value}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
