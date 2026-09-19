import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Icons } from "../icons.jsx";

// Shared table for every admin page: global search, per-column filters,
// multi-column sort (shift-click a header for a secondary sort key),
// pagination. Columns opt into special cell rendering via
// `column.meta.cellType` ("select" | "boolean" | "actions") and per-column
// filter UI via `column.meta.filterVariant` ("text" default | "select").
export default function DataTable({
  data,
  columns,
  getRowId,
  emptyMessage = "No rows to show.",
  pageSize = 25,
}) {
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [compact, setCompact] = useState(() => {
    try { return localStorage.getItem("admin-table-density") !== "comfortable"; } catch { return true; }
  });

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
    initialState: { pagination: { pageSize: (() => { try { return Number(localStorage.getItem("admin-table-page-size")) || pageSize; } catch { return pageSize; } })() } },
  });

  const rows = table.getRowModel().rows;
  const rowAnimationKey = `${compact ? "compact" : "comfortable"}-${globalFilter}-${JSON.stringify(columnFilters)}-${sorting.map((item) => `${item.id}:${item.desc}`).join("|")}`;
  const filterableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanFilter());
  const columnLabels = useMemo(() => {
    const labels = new Map();
    for (const column of columns) {
      const id = column.id || column.accessorKey;
      if (!id) continue;
      labels.set(id, typeof column.header === "string" ? column.header : id);
    }
    return labels;
  }, [columns]);

  return (
    // Bound the row area so search and pagination remain within reach.
    <div className={`pp-table-card${compact ? " table-is-compact" : ""}${showFilters ? " table-filters-open" : ""}`}>
      <div className="pp-table-toolbar">
        <div className="table-search-wrap">
          <Icons.search size={16} />
          <input
            className="pp-table-search"
            type="search"
            placeholder="Search this collection…"
            aria-label="Search this collection"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>
        <span className="pp-table-count">
          {table.getFilteredRowModel().rows.length} / {data.length} records
        </span>
        <div className="table-toolbar-actions">
          <button
            className="pp-btn"
            aria-pressed={showFilters}
            onClick={() => setShowFilters((value) => !value)}
          >
            <Icons.filter size={14} />
            Filters
            {columnFilters.length > 0 ? ` (${columnFilters.length})` : ""}
          </button>
          <button
            className="pp-btn"
            aria-label="Compact rows"
            aria-pressed={compact}
            onClick={() => setCompact((value) => {
              const next = !value;
              try { localStorage.setItem("admin-table-density", next ? "compact" : "comfortable"); } catch {}
              return next;
            })}
          >
            <Icons.rows size={14} />
            <span>Compact</span>
          </button>
          {(globalFilter || columnFilters.length > 0) && (
            <button
              className="pp-btn pp-btn-text"
              onClick={() => {
                setGlobalFilter("");
                setColumnFilters([]);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="pp-table-filter-panel" aria-label="Column filters">
          {filterableColumns.map((column) => (
            <label className="pp-table-filter-field" key={column.id}>
              <span>
                {columnLabels.get(column.id) || column.columnDef.header || column.id}
              </span>
              <ColumnFilter column={column} />
            </label>
          ))}
        </div>
      )}

      <div className="pp-table-scroll pp-scroll">
        <table className="pp-table" aria-label="Collection records">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={
                      header.column.getIsSorted() ? "pp-th-sorted" : ""
                    }
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : undefined
                    }
                    scope="col"
                  >
                    <button
                      type="button"
                      className="pp-th-label"
                      disabled={!header.column.getCanSort()}
                      onClick={
                        header.column.getCanSort()
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted()] ||
                        ""}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody key={rowAnimationKey}>
            {rows.length === 0 ? (
              <tr>
                <td className="pp-empty-state" colSpan={columns.length}>
                  <div className="table-empty-content">
                    <Icons.search size={28} />
                    <strong>
                      {data.length ? "No matching records" : emptyMessage}
                    </strong>
                    <p>
                      {data.length
                        ? "Try a different search or clear your filters."
                        : "New records will appear here when they are available."}
                    </p>
                    {data.length > 0 && (
                      <button
                        className="pp-btn"
                        onClick={() => {
                          setGlobalFilter("");
                          setColumnFilters([]);
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id} style={{ "--row-index": index }}>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      data-label={
                        columnLabels.get(cell.column.id) || cell.column.id
                      }
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pp-table-pagination">
        <span className="pagination-summary">
          {table.getFilteredRowModel().rows.length
            ? `${table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–${Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)}`
            : "0"}{" "}
          of {table.getFilteredRowModel().rows.length} records
        </span>
        <div className="pagination-controls">
          <label>
            Rows{" "}
            <select
              aria-label="Rows per page"
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              {[...new Set([10, 25, 50, 100, pageSize])]
                .sort((a, b) => a - b)
                .map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="icon-button"
            aria-label="Previous page"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <Icons.left size={15} />
          </button>
          <span>
            {table.getState().pagination.pageIndex + 1} /{" "}
            {Math.max(1, table.getPageCount())}
          </span>
          <button
            className="icon-button"
            aria-label="Next page"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <Icons.right size={15} />
          </button>
        </div>
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
      <select
        className="pp-col-filter"
        aria-label={`Filter ${column.columnDef.header}`}
        value={value}
        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      >
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
      aria-label={`Filter ${column.columnDef.header}`}
      placeholder="Filter…"
      value={value}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
