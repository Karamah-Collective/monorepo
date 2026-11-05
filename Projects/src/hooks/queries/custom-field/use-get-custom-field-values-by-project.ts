import { useQuery } from "@tanstack/react-query";
import getCustomFieldValuesByProject, {
  type CustomFieldValue,
} from "@/fetchers/custom-field/get-custom-field-values-by-project";

export type { CustomFieldValue } from "@/fetchers/custom-field/get-custom-field-values-by-project";

function useGetCustomFieldValuesByProject(projectId: string) {
  return useQuery<CustomFieldValue[]>({
    queryKey: ["custom-field-values", projectId],
    queryFn: () => getCustomFieldValuesByProject({ projectId }),
    enabled: Boolean(projectId),
  });
}

export default useGetCustomFieldValuesByProject;
