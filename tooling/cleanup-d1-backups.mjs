const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const bucket = process.env.BACKUP_BUCKET;
const token = process.env.CLOUDFLARE_DB_BACKUP_API_TOKEN;
if (!account || !bucket || !token) throw new Error("Missing backup environment variables");

const api = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${encodeURIComponent(bucket)}/objects`;
let cursor = "";
const objects = [];
do {
  const response = await fetch(`${api}?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Could not list R2 backups (${response.status})`);
  const body = await response.json();
  objects.push(...(body.result || []));
  cursor = body.result_info?.cursor || "";
} while (cursor);

const now = Date.now();
const limits = { daily: 7 * 86400000, weekly: 31 * 86400000, monthly: 93 * 86400000 };
function keyTimestamp(kind, value) {
  if (kind === "daily") return Date.parse(`${value}T00:00:00Z`);
  if (kind === "monthly") return Date.parse(`${value}-01T00:00:00Z`);
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return NaN;
  const januaryFourth = new Date(Date.UTC(Number(match[1]), 0, 4));
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - ((januaryFourth.getUTCDay() + 6) % 7) + (Number(match[2]) - 1) * 7);
  return monday.getTime();
}

const expired = objects.filter(({ key }) => {
  const match = /^(daily|weekly|monthly)\/(\d{4}-\d{2}(?:-\d{2}|-W\d{2})?)\/(?:halal-finder-db|karamah-admin-db)\.sql$/.exec(key || "");
  if (!match) return false;
  const timestamp = keyTimestamp(match[1], match[2]);
  return Number.isFinite(timestamp) && now - timestamp > limits[match[1]];
});

for (const { key } of expired) {
  const response = await fetch(`${api}/${key.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Could not delete expired backup ${key} (${response.status})`);
}
console.log(`Backup retention checked: ${expired.length} expired object(s) removed.`);
