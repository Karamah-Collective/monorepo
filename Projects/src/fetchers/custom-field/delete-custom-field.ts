import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

async function deleteCustomField({ id }: { id: string }) {
  const response = await client["custom-field"][":id"].$delete({
    param: { id },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default deleteCustomField;
