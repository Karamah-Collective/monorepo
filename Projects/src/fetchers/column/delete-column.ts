import { client } from "@karamah/projects-libs";

import { HttpError } from "@/lib/http-error";

async function deleteColumn(id: string) {
  const response = await client.column[":id"].$delete({
    param: { id },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default deleteColumn;
