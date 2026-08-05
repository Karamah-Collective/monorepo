import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import DropdownCell from "../components/DropdownCell.jsx";
import { useAdminContacts, useUpdateContactReplied } from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";
import { CONTACT_REPLIED_OPTIONS } from "../constants.js";

const columnHelper = createColumnHelper();

export default function ContactsPage() {
  const { data, isLoading, error } = useAdminContacts();
  const updateReplied = useUpdateContactReplied();
  const showToast = useToast();

  const rows = useMemo(() => {
    if (!data) return [];
    return [...data.unreplied, ...data.replied];
  }, [data]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("timestamp", { header: "Received" }),
      columnHelper.accessor("name", { header: "Name" }),
      columnHelper.accessor("email", { header: "Email" }),
      columnHelper.accessor("phone", { header: "Phone" }),
      columnHelper.accessor("message", { header: "Message" }),
      columnHelper.accessor((row) => (row.replied ? "yes" : "no"), {
        id: "replied",
        header: "Replied",
        meta: { filterVariant: "select", options: CONTACT_REPLIED_OPTIONS },
        filterFn: "equals",
        cell: (info) => (
          <DropdownCell
            value={info.getValue()}
            options={CONTACT_REPLIED_OPTIONS}
            disabled={updateReplied.isPending}
            onChange={(value) =>
              updateReplied.mutate(
                { rowId: info.row.original.rowId, replied: value },
                { onSuccess: () => showToast("Updated"), onError: (e) => showToast(e.message, "error") }
              )
            }
          />
        ),
      }),
    ],
    [updateReplied, showToast]
  );

  return (
    <div className="pp-page">
      <h1 className="pp-page-title">Contacts</h1>
      {isLoading && <p>Loading…</p>}
      {error && <p className="pp-error-text">{error.message}</p>}
      {data && <DataTable data={rows} columns={columns} getRowId={(row) => row.rowId} emptyMessage="No contact messages." />}
    </div>
  );
}
