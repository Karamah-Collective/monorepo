import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import ToggleCell from "../components/ToggleCell.jsx";
import SponsorEditor from "../components/SponsorEditor.jsx";
import { useAdminPlaces, useUpdateBoycott, useUpdatePlaceDisabled, useUpdateSponsor } from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";
import { TYPE_OPTIONS } from "../constants.js";

const columnHelper = createColumnHelper();

export default function PlacesPage() {
  const { data, isLoading, error } = useAdminPlaces();
  const updateBoycott = useUpdateBoycott();
  const updateDisabled = useUpdatePlaceDisabled();
  const updateSponsor = useUpdateSponsor();
  const showToast = useToast();

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", { header: "Name" }),
      columnHelper.accessor("type", {
        header: "Type",
        meta: { filterVariant: "select", options: TYPE_OPTIONS },
        filterFn: "equals",
      }),
      columnHelper.accessor("city", { header: "City" }),
      columnHelper.accessor("address", { header: "Address" }),
      columnHelper.accessor("boycott", {
        header: "Boycott",
        enableColumnFilter: false,
        cell: (info) => (
          <ToggleCell
            checked={info.getValue()}
            disabled={updateBoycott.isPending}
            label={info.getValue() ? "Boycotted" : ""}
            onChange={(checked) =>
              updateBoycott.mutate(
                { placeId: info.row.original.id, boycott: checked },
                {
                  onSuccess: () => showToast("Boycott status updated"),
                  onError: (e) => showToast(e.message, "error"),
                }
              )
            }
          />
        ),
      }),
      columnHelper.accessor((row) => (row.disabled ? "Disabled" : "Visible"), {
        id: "mapVisibility",
        header: "Map",
        meta: {
          filterVariant: "select",
          options: [
            { value: "Visible", label: "Visible" },
            { value: "Disabled", label: "Disabled" },
          ],
        },
        filterFn: "equalsString",
        cell: (info) => (
          <ToggleCell
            checked={!info.row.original.disabled}
            disabled={updateDisabled.isPending}
            label={info.row.original.disabled ? "Disabled" : "Visible"}
            onChange={(visible) =>
              updateDisabled.mutate(
                { placeId: info.row.original.id, disabled: !visible },
                {
                  onSuccess: () => showToast(visible ? "Place enabled on map" : "Place disabled on map"),
                  onError: (e) => showToast(e.message, "error"),
                }
              )
            }
          />
        ),
      }),
      columnHelper.display({
        id: "sponsor",
        header: "Sponsor",
        cell: (info) => (
          <SponsorEditor
            place={info.row.original}
            saving={updateSponsor.isPending}
            onSave={(body) =>
              updateSponsor.mutate(body, {
                onSuccess: () => showToast("Sponsor details updated"),
                onError: (e) => showToast(e.message, "error"),
              })
            }
          />
        ),
      }),
    ],
    [updateBoycott, updateDisabled, updateSponsor, showToast]
  );

  return (
    <div className="pp-page">
      <h1 className="pp-page-title">Places</h1>
      {isLoading && <p>Loading…</p>}
      {error && <p className="pp-error-text">{error.message}</p>}
      {data && <DataTable data={data} columns={columns} getRowId={(row) => row.id} />}
    </div>
  );
}
