const DIRECTORY_WORKSHEET = "people_directory";

function envValue(env, keys, fallback = "") {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim().replace(/^"|"$/g, "");
    }
  }
  return fallback;
}

function jsonResponse(body, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cache,
    },
  });
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeKey(key) {
  return clean(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizePerson(row) {
  if (!row || typeof row !== "object") return null;

  const byKey = {};
  for (const [key, value] of Object.entries(row)) {
    byKey[normalizeKey(key)] = value;
  }

  const person = {
    name: clean(byKey.name),
    email: clean(byKey.email).toLowerCase(),
    position: clean(byKey.position),
    description: clean(byKey.description),
    location: clean(byKey.location),
    order: Number(byKey.order) || 0,
    status: clean(byKey.status).toLowerCase(),
  };

  if (!person.name) return null;
  if (person.status && person.status !== "active") return null;

  return {
    name: person.name,
    email: person.email,
    position: person.position,
    description: person.description,
    location: person.location,
    order: person.order,
  };
}

async function fetchDirectory(sheetUrl) {
  const url = new URL(sheetUrl);
  url.searchParams.set("worksheet", DIRECTORY_WORKSHEET);

  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 60, cacheEverything: false },
  });

  if (!res.ok) {
    throw new Error(`Sheet read failed (${res.status})`);
  }

  const data = await res.json();
  if (data?.success === false) throw new Error('Team directory unavailable');
  const rows = Array.isArray(data?.people)
    ? data.people
    : Array.isArray(data?.rows)
      ? data.rows
      : [];

  return rows.map(normalizePerson).filter(Boolean).sort((a,b) => a.order - b.order);
}

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const sheetUrl = envValue(env, [
      "GOOGLE_SHEET_URL",
      "googleSheetUrl",
      "googleSheetsURL",
    ]);
    if (!sheetUrl) {
      return jsonResponse(
        { success: false, people: [], message: "GOOGLE_SHEET_URL missing" },
        503,
      );
    }

    const people = await fetchDirectory(sheetUrl);

    return jsonResponse(
      {
        success: true,
        worksheet: DIRECTORY_WORKSHEET,
        people,
      },
      200,
      "public, max-age=60, s-maxage=60",
    );
  } catch (error) {
    console.error("Team directory error:", error);
    return jsonResponse(
      { success: false, people: [], message: "Team directory unavailable" },
      502,
    );
  }
}
