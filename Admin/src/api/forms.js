import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./client.js";
import { auth } from "../firebase.js";

export const formsOrigin = (import.meta.env.VITE_FORMS_ORIGIN || (import.meta.env.DEV ? "http://127.0.0.1:8791" : "https://forms.karamahcollective.com")).replace(/\/$/, "");
export const formPublicUrl = slug => `${formsOrigin}/forms/${encodeURIComponent(slug)}`;
export const formAssetUrl = assetId => `${formsOrigin}/api/media?id=${encodeURIComponent(assetId)}`;
export async function uploadFormCover(formId, file, alt = "") {
  if (!auth.currentUser) throw new Error("Not signed in");
  const body = new FormData(); body.set("formId", formId); body.set("file", file); body.set("alt", alt);
  const base = import.meta.env.DEV ? "" : (import.meta.env.VITE_MAPS_ORIGIN || "https://maps.karamahcollective.com").replace(/\/$/, "");
  const response = await fetch(`${base}/api/form-asset`, { method: "POST", headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }, body });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || "Image upload failed"); return result;
}

export function useForms(params = {}) { return useQuery({ queryKey: ["forms", params], queryFn: () => apiGet("forms-list", params) }); }
export function useForm(id) { return useQuery({ queryKey: ["form", id], queryFn: () => apiGet("forms-get", { id }), enabled: !!id }); }
export function useFormSubmissions(id) { return useQuery({ queryKey: ["form-submissions", id], queryFn: () => apiGet("forms-submissions", { id, limit: 100 }), enabled: !!id }); }
export function useFormAnalytics(id) { return useQuery({ queryKey: ["form-analytics", id], queryFn: () => apiGet("forms-analytics", { id }), enabled: !!id }); }
export function useFormVersion(id, versionId) { return useQuery({ queryKey: ["form-version", id, versionId], queryFn: () => apiGet("forms-version", { id, versionId }), enabled: !!id && !!versionId }); }

function mutation(action, invalidates = []) {
  return function useFormsMutation() {
    const client = useQueryClient();
    return useMutation({ mutationFn: body => apiPost(action, body), onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["forms"] });
      if (variables?.id) for (const key of [["form", variables.id], ["form-submissions", variables.id], ["form-analytics", variables.id]]) client.invalidateQueries({ queryKey: key });
      for (const key of invalidates) client.invalidateQueries({ queryKey: [key] });
    } });
  };
}

export const useCreateForm = mutation("forms-create");
export const useSaveForm = mutation("forms-save");
export const usePublishForm = mutation("forms-publish");
export const useSetFormStatus = mutation("forms-status");
export const useDuplicateForm = mutation("forms-duplicate");
export const useDeleteForm = mutation("forms-delete");
export const useDeleteSubmission = mutation("forms-delete-submission");
export const exportFormResponses = id => apiGet("forms-export", { id });
