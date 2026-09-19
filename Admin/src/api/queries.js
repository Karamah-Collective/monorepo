import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./client.js";

// ── Read queries ─────────────────────────────────────────────────────────

export const useAdminStats = () => useQuery({ queryKey: ["admin-stats"], queryFn: () => apiGet("admin-stats") });
export const usePendingNew = () => useQuery({ queryKey: ["pending-new"], queryFn: () => apiGet("pending-new") });
export const usePendingEdits = () => useQuery({ queryKey: ["pending-edits"], queryFn: () => apiGet("pending-edits") });
export const useAdminPlaces = () => useQuery({ queryKey: ["admin-places"], queryFn: () => apiGet("admin-places") });
export const useAdminContacts = () => useQuery({ queryKey: ["admin-contact"], queryFn: () => apiGet("admin-contact") });
export const useAdminWishes = () => useQuery({ queryKey: ["admin-wishes"], queryFn: () => apiGet("admin-wishes") });
export const useAdminEvents = () => useQuery({ queryKey: ["admin-events"], queryFn: () => apiGet("admin-events") });
export const usePendingEventEdits = () => useQuery({ queryKey: ["pending-event-edits"], queryFn: () => apiGet("pending-event-edits") });
export const useAdminReviews = () => useQuery({ queryKey: ["admin-reviews"], queryFn: () => apiGet("admin-reviews") });
export const usePendingEid = () => useQuery({ queryKey: ["pending-eid"], queryFn: () => apiGet("pending-eid") });
export const useAdminEidPrayers = () => useQuery({ queryKey: ["admin-eid-prayers"], queryFn: () => apiGet("admin-eid-prayers") });
export const useAdminLog = () => useQuery({ queryKey: ["admin-log"], queryFn: () => apiGet("admin-log", { limit: 200 }) });
export const useAdminSocialVideos = () =>
  useQuery({ queryKey: ["admin-social-videos"], queryFn: () => apiGet("admin-social-videos") });
export const useAdminTypeStyles = () => useQuery({ queryKey: ["admin-type-styles"], queryFn: () => apiGet("admin-type-styles") });
export const useAdminAppSettings = () => useQuery({ queryKey: ["admin-app-settings"], queryFn: () => apiGet("admin-app-settings") });

// ── Mutations — every one invalidates the queries it can affect, so a
// pending row disappearing / stats changing shows up immediately without
// a manual refresh. ──────────────────────────────────────────────────────

function useAdminMutation(action, invalidateKeys) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => apiPost(action, body),
    onSuccess: () => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: [key] });
      queryClient.invalidateQueries({ queryKey: ["admin-log"] });
    },
  });
}

export const useApproveNew = () => useAdminMutation("approve-new", ["pending-new", "admin-places", "admin-stats"]);
export const useRejectNew = () => useAdminMutation("reject-new", ["pending-new", "admin-stats"]);
export const useApproveEdit = () => useAdminMutation("approve-edit", ["pending-edits", "admin-places", "admin-stats"]);
export const useRejectEdit = () => useAdminMutation("reject-edit", ["pending-edits", "admin-stats"]);
export const useUpdateBoycott = () => useAdminMutation("update-boycott", ["admin-places"]);
export const useUpdatePlaceDisabled = () => useAdminMutation("update-place-disabled", ["admin-places", "admin-stats"]);
export const useUpdatePlaceCoordinates = () => useAdminMutation("update-place-coordinates", ["admin-places"]);
export const useRefreshPlaceInfo = () => useAdminMutation("refresh-place-info", ["admin-places", "admin-reviews"]);
export const useDeletePlace = () => useAdminMutation("delete-place", ["admin-places", "admin-stats", "admin-events", "admin-reviews"]);
export const useUpdateSponsor = () => useAdminMutation("update-sponsor", ["admin-places"]);
export const useUpdateContactReplied = () => useAdminMutation("update-contact-replied", ["admin-contact", "admin-stats"]);
export const useUpdateWishApproved = () => useAdminMutation("update-wish-approved", ["admin-wishes", "admin-stats"]);
export const useUpdateWishImplemented = () => useAdminMutation("update-wish-implemented", ["admin-wishes"]);
export const useApproveEvent = () => useAdminMutation("approve-event", ["admin-events", "admin-stats"]);
export const useRejectEvent = () => useAdminMutation("reject-event", ["admin-events", "admin-stats"]);
export const useDeleteEvent = () => useAdminMutation("delete-event", ["admin-events", "pending-event-edits", "admin-stats"]);
export const useApproveEventEdit = () => useAdminMutation("approve-event-edit", ["pending-event-edits", "admin-events", "admin-stats"]);
export const useRejectEventEdit = () => useAdminMutation("reject-event-edit", ["pending-event-edits", "admin-stats"]);
export const useApproveReview = () => useAdminMutation("approve-review", ["admin-reviews"]);
export const useRejectReview = () => useAdminMutation("reject-review", ["admin-reviews"]);
export const useApproveEid = () => useAdminMutation("approve-eid", ["pending-eid", "admin-eid-prayers", "admin-stats"]);
export const useRejectEid = () => useAdminMutation("reject-eid", ["pending-eid", "admin-stats"]);
export const useUpsertSocialVideo = () => useAdminMutation("upsert-social-video", ["admin-social-videos"]);
export const useDeleteSocialVideo = () => useAdminMutation("delete-social-video", ["admin-social-videos"]);
export const useUpdateTypeStyle = () => useAdminMutation("update-type-style", ["admin-type-styles"]);
export const useUpdateAppSettings = () => useAdminMutation("update-app-settings", ["admin-app-settings"]);
