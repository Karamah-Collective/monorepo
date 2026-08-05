import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import DropdownCell from "../components/DropdownCell.jsx";
import { useAdminWishes, useUpdateWishApproved, useUpdateWishImplemented } from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";
import { WISH_APPROVED_OPTIONS, WISH_IMPLEMENTED_OPTIONS } from "../constants.js";

const columnHelper = createColumnHelper();

export default function WishesPage() {
  const { data, isLoading, error } = useAdminWishes();
  const updateApproved = useUpdateWishApproved();
  const updateImplemented = useUpdateWishImplemented();
  const showToast = useToast();

  const columns = useMemo(
    () => [
      columnHelper.accessor("title", { header: "Title" }),
      columnHelper.accessor("description", { header: "Description" }),
      columnHelper.accessor("votes", { header: "Votes" }),
      columnHelper.accessor("name", { header: "Submitted by" }),
      columnHelper.accessor("approved", {
        header: "Approved",
        meta: { filterVariant: "select", options: WISH_APPROVED_OPTIONS },
        filterFn: "equals",
        cell: (info) => (
          <DropdownCell
            value={info.getValue()}
            options={WISH_APPROVED_OPTIONS}
            disabled={updateApproved.isPending}
            onChange={(value) =>
              updateApproved.mutate(
                { wishId: info.row.original.wishId, value },
                { onSuccess: () => showToast("Updated"), onError: (e) => showToast(e.message, "error") }
              )
            }
          />
        ),
      }),
      columnHelper.accessor("implemented", {
        header: "Implemented",
        meta: { filterVariant: "select", options: WISH_IMPLEMENTED_OPTIONS },
        filterFn: "equals",
        cell: (info) => (
          <DropdownCell
            value={info.getValue()}
            options={WISH_IMPLEMENTED_OPTIONS}
            disabled={updateImplemented.isPending}
            onChange={(value) =>
              updateImplemented.mutate(
                { wishId: info.row.original.wishId, value },
                { onSuccess: () => showToast("Updated"), onError: (e) => showToast(e.message, "error") }
              )
            }
          />
        ),
      }),
    ],
    [updateApproved, updateImplemented, showToast]
  );

  return (
    <div>
      <h1 className="pp-page-title">Wishes</h1>
      {isLoading && <p>Loading…</p>}
      {error && <p className="pp-error-text">{error.message}</p>}
      {data && <DataTable data={data} columns={columns} getRowId={(row) => String(row.wishId)} emptyMessage="No wishes." />}
    </div>
  );
}
