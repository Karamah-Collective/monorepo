import { LoadingState } from "../components/QueryState.jsx";
import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import { useAdminLog } from "../api/queries.js";

const columnHelper = createColumnHelper();

export default function LogPage() {
  const { data, isLoading, error } = useAdminLog();

  const columns = useMemo(
    () => [
      columnHelper.accessor("createdAt", { header: "When" }),
      columnHelper.accessor("actorName", { header: "Name" }),
      columnHelper.accessor("actorEmail", { header: "Email" }),
      columnHelper.accessor("action", { header: "Action" }),
      columnHelper.accessor("targetId", { header: "Target" }),
      columnHelper.accessor("success", {
        header: "Result",
        cell: (info) => (info.getValue() ? "OK" : "Failed"),
      }),
      columnHelper.display({
        id: "detail",
        header: "Detail",
        cell: (info) => {
          const detail = info.row.original.detail;
          if (!detail || Object.keys(detail).length === 0) return "-";
          return (
            <details className="log-detail">
              <summary>View detail</summary>
              <pre>{JSON.stringify(detail, null, 2)}</pre>
            </details>
          );
        },
      }),
    ],
    [],
  );

  return (
    <div className="pp-page activity-log-page">
      <h1 className="pp-page-title">Activity Log</h1>
      <p className="pp-page-lead">
        Every approval, rejection, update, sign-in, and sign-up, visible to the
        whole team.
      </p>
      {isLoading && <LoadingState />}
      {error && <p className="pp-error-text">{error.message}</p>}
      {data && (
        <DataTable
          data={data.entries}
          columns={columns}
          getRowId={(row) => String(row.id)}
          emptyMessage="No activity yet."
          pageSize={50}
        />
      )}
    </div>
  );
}
