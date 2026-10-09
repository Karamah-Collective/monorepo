import { json } from "../_shared.js";
import { ingestInbox } from "../_inbox.js";
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error:"Unavailable" },503);
  const token=request.headers.get("X-Inbox-Secret")||""; if (!env.INBOX_INGEST_SECRET || token !== env.INBOX_INGEST_SECRET) return json({error:"Unauthorized"},401);
  let body; try { body=await request.json(); } catch { return json({error:"Invalid JSON"},400); }
  const result=await ingestInbox(env.DB,body); return json(result,result.error?400:200);
}
