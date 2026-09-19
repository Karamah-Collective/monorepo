import { LoadingState } from "../components/QueryState.jsx";
import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../components/DataTable.jsx";
import ManageActions from "../components/ManageActions.jsx";
import {
  useAdminPlaces,
  useAdminSocialVideos,
  useDeleteSocialVideo,
  useUpsertSocialVideo,
} from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";
import { PLATFORM_OPTIONS } from "../constants.js";

const columnHelper = createColumnHelper();

const EMPTY_FORM = {
  placeId: "",
  platform: "YouTube",
  url: "",
  title: "",
  creator: "",
  thumbnailUrl: "",
};

function detectPlatform(url) {
  const lower = (url || "").toLowerCase();
  if (lower.includes("tiktok.com") || lower.includes("vm.tiktok.com"))
    return "TikTok";
  if (lower.includes("instagram.com") || lower.includes("instagr.am"))
    return "Instagram";
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "YouTube";
  return "";
}

export default function SocialVideosPage() {
  const { data: videos, isLoading, error } = useAdminSocialVideos();
  const { data: places } = useAdminPlaces();
  const upsertVideo = useUpsertSocialVideo();
  const deleteVideo = useDeleteSocialVideo();
  const showToast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [placeQuery, setPlaceQuery] = useState("");

  const placeById = useMemo(() => {
    const map = new Map();
    for (const place of places || []) map.set(place.id, place);
    return map;
  }, [places]);

  const placeOptions = useMemo(() => {
    const q = placeQuery.trim().toLowerCase();
    const list = places || [];
    if (!q) return list.slice(0, 40);
    return list
      .filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.city || "").toLowerCase().includes(q) ||
          (p.id || "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [places, placeQuery]);

  const rows = useMemo(() => {
    return (videos || []).map((video) => ({
      ...video,
      placeName: placeById.get(video.placeId)?.name || "",
    }));
  }, [videos, placeById]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("placeName", {
        header: "Place",
        cell: (info) => info.getValue() || "—",
      }),
      columnHelper.accessor("placeId", { header: "Place ID" }),
      columnHelper.accessor("platform", {
        header: "Platform",
        meta: { filterVariant: "select", options: PLATFORM_OPTIONS },
        filterFn: "equals",
      }),
      columnHelper.accessor("title", { header: "Title" }),
      columnHelper.accessor("creator", { header: "Creator" }),
      columnHelper.accessor("url", {
        header: "URL",
        enableColumnFilter: false,
        cell: (info) => {
          const url = info.getValue();
          if (!url) return "—";
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="pp-btn-text"
            >
              Open
            </a>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        enableColumnFilter: false,
        cell: (info) => (
          <ManageActions disabled={deleteVideo.isPending}>
            {({ close }) => <button
              type="button"
              role="menuitem"
              className="pp-manage-action pp-manage-action-danger"
              onClick={() => {
                close();
                if (!window.confirm("Remove this video from Discover?")) return;
                deleteVideo.mutate(
                  { videoId: info.row.original.id },
                  {
                    onSuccess: () => showToast("Video removed"),
                    onError: (e) => showToast(e.message, "error"),
                  },
                );
              }}
            >
              <span>Delete video</span><small>Remove it from Discover</small>
            </button>}
          </ManageActions>
        ),
      }),
    ],
    [deleteVideo, showToast],
  );

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onUrlBlur() {
    const detected = detectPlatform(form.url);
    if (detected) updateField("platform", detected);
  }

  async function onSubmit(event) {
    event.preventDefault();
    const placeId = form.placeId.trim();
    const url = form.url.trim();
    if (!placeId || !url) {
      showToast("Place and URL are required", "error");
      return;
    }

    upsertVideo.mutate(
      {
        video: {
          placeId,
          platform: form.platform,
          url,
          title: form.title.trim(),
          creator: form.creator.trim(),
          thumbnailUrl: form.thumbnailUrl.trim(),
        },
      },
      {
        onSuccess: (result) => {
          if (result?.success === false) {
            showToast(result.error || "Could not save video", "error");
            return;
          }
          showToast("Video added to Discover");
          setForm(EMPTY_FORM);
          setPlaceQuery("");
        },
        onError: (e) => showToast(e.message, "error"),
      },
    );
  }

  return (
    <div className="pp-page">
      <h1 className="pp-page-title">Social Videos</h1>
      <p className="pp-page-lead">
        Metadata-only clips for the Anar Discover feed. Tapping a tile opens
        TikTok, Instagram, or YouTube — nothing is hosted here.
      </p>

      <form className="pp-panel pp-social-form" onSubmit={onSubmit}>
        <h2 className="pp-panel-title">Add video</h2>

        <div className="pp-social-grid">
          <div className="pp-field">
            <label htmlFor="sv-place-search">Place</label>
            <input
              id="sv-place-search"
              list="sv-place-options"
              value={placeQuery}
              placeholder="Search name, city, or id…"
              onChange={(e) => {
                const value = e.target.value;
                setPlaceQuery(value);
                const match = (places || []).find(
                  (p) =>
                    p.id === value ||
                    `${p.name} (${p.id})` === value ||
                    p.name === value,
                );
                if (match) updateField("placeId", match.id);
              }}
              onBlur={() => {
                const match = (places || []).find(
                  (p) =>
                    p.id === placeQuery.trim() ||
                    `${p.name} (${p.id})` === placeQuery.trim() ||
                    p.name === placeQuery.trim(),
                );
                if (match) {
                  updateField("placeId", match.id);
                  setPlaceQuery(`${match.name} (${match.id})`);
                }
              }}
            />
            <datalist id="sv-place-options">
              {placeOptions.map((p) => (
                <option key={p.id} value={`${p.name} (${p.id})`} />
              ))}
            </datalist>
            {form.placeId ? (
              <span className="pp-field-hint">
                Linked place id: {form.placeId}
              </span>
            ) : (
              <span className="pp-field-hint">
                Pick a published place from the list
              </span>
            )}
          </div>

          <div className="pp-field">
            <label htmlFor="sv-url">Video URL</label>
            <input
              id="sv-url"
              type="url"
              required
              value={form.url}
              placeholder="https://www.youtube.com/watch?v=…"
              onChange={(e) => updateField("url", e.target.value)}
              onBlur={onUrlBlur}
            />
          </div>

          <div className="pp-field">
            <label htmlFor="sv-platform">Platform</label>
            <select
              id="sv-platform"
              value={form.platform}
              onChange={(e) => updateField("platform", e.target.value)}
            >
              {PLATFORM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="pp-field">
            <label htmlFor="sv-title">Title</label>
            <input
              id="sv-title"
              value={form.title}
              placeholder="Optional card title"
              onChange={(e) => updateField("title", e.target.value)}
            />
          </div>

          <div className="pp-field">
            <label htmlFor="sv-creator">Creator</label>
            <input
              id="sv-creator"
              value={form.creator}
              placeholder="@handle"
              onChange={(e) => updateField("creator", e.target.value)}
            />
          </div>

          <div className="pp-field">
            <label htmlFor="sv-thumb">Thumbnail URL</label>
            <input
              id="sv-thumb"
              type="url"
              value={form.thumbnailUrl}
              placeholder="Optional — needed for TikTok / Instagram"
              onChange={(e) => updateField("thumbnailUrl", e.target.value)}
            />
            <span className="pp-field-hint">YouTube can leave this blank</span>
          </div>
        </div>

        <div className="pp-social-form-actions">
          <button
            type="submit"
            className="pp-btn pp-btn-primary pp-btn-inline"
            disabled={upsertVideo.isPending}
          >
            {upsertVideo.isPending ? "Saving…" : "Add to Discover"}
          </button>
        </div>
      </form>

      {isLoading && <LoadingState />}
      {error && <p className="pp-error-text">{error.message}</p>}
      {videos && (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          emptyMessage="No social videos yet. Add one above."
        />
      )}
    </div>
  );
}
