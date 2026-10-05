import { LoadingState } from "../components/QueryState.jsx";
import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import ActionCell from "../components/ActionCell.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import {
  useAdminEvents,
  useApproveEvent,
  useRejectEvent,
  useDeleteEvent,
} from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";

const columnHelper = createColumnHelper();
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "yes", label: "Approved" },
  { value: "no", label: "Rejected" },
];

function EventLocation({ event }) {
  const name = event.placeName || event.locationName || "Custom location";
  const mapsLink = /^https?:\/\//i.test(event.locationGmapsLink || "") ? event.locationGmapsLink : "";
  const detail = event.locationAddress || (
    event.locationLat != null && event.locationLng != null
      ? `${Number(event.locationLat).toFixed(5)}, ${Number(event.locationLng).toFixed(5)}`
      : ""
  );
  return (
    <div className="event-location-cell">
      {mapsLink ? (
        <a href={mapsLink} target="_blank" rel="noreferrer">{name}</a>
      ) : <span>{name}</span>}
      {detail && <small>{detail}</small>}
    </div>
  );
}

export default function EventsPage() {
  const { data, isLoading, error } = useAdminEvents();
  const approve = useApproveEvent();
  const reject = useRejectEvent();
  const deleteEvent = useDeleteEvent();
  const showToast = useToast();

  const columns = useMemo(
    () => [
      columnHelper.accessor("title", { header: "Title" }),
      columnHelper.accessor((row) => row.placeName || row.locationName || row.locationAddress || "Custom location", {
        id: "location",
        header: "Location",
        cell: (info) => <EventLocation event={info.row.original} />,
      }),
      columnHelper.accessor("eventDate", { header: "Date" }),
      columnHelper.accessor("eventTime", { header: "Time" }),
      columnHelper.accessor("status", {
        header: "Status",
        meta: { filterVariant: "select", options: STATUS_OPTIONS },
        filterFn: "equals",
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: (info) => {
          const row = info.row.original;
          return (
            <ActionCell
              approving={approve.isPending}
              rejecting={reject.isPending}
              deleting={deleteEvent.isPending}
              onApprove={row.status === "pending" ? () =>
                approve.mutate(
                  { eventId: row.eventId },
                  {
                    onSuccess: () => showToast("Approved"),
                    onError: (e) => showToast(e.message, "error"),
                  },
                )
              : undefined}
              onReject={row.status === "pending" ? (reason) =>
                reject.mutate(
                  { eventId: row.eventId, reason },
                  {
                    onSuccess: () => showToast("Rejected"),
                    onError: (e) => showToast(e.message, "error"),
                  },
                )
              : undefined}
              onDelete={() => {
                if (!window.confirm(`Permanently delete "${row.title}"? This cannot be undone.`)) return;
                deleteEvent.mutate(
                  { eventId: row.eventId },
                  {
                    onSuccess: () => showToast("Event deleted"),
                    onError: (e) => showToast(e.message, "error"),
                  },
                );
              }}
            />
          );
        },
      }),
    ],
    [approve, reject, deleteEvent, showToast],
  );

  return (
    <div className="pp-page">
      <h1 className="pp-page-title">Events</h1>
      {isLoading && <LoadingState />}
      {error && <p className="pp-error-text">{error.message}</p>}
      {data && (
        <DataTable
          data={data}
          columns={columns}
          getRowId={(row) => String(row.eventId)}
          emptyMessage="No events."
        />
      )}
    </div>
  );
}
