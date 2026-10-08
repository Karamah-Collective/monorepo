import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const documents = [
  "README.md",
  "docs/PLATFORM_ARCHITECTURE.md",
  "docs/APPLICATION_GUIDE.md",
  "docs/DATA_IDENTITY_SECURITY.md",
  "docs/DEVELOPMENT_AND_RELEASE.md",
  "docs/OPERATIONS_GUIDE.md",
  "docs/SERVICE_CATALOG.md",
  "docs/CONTRIBUTOR_PLAYBOOK.md",
  "docs/DEEP_DIVE_MANARAH.md",
  "docs/DEEP_DIVE_WEBSITE.md",
  "docs/DEEP_DIVE_ADMIN.md",
  "docs/DEEP_DIVE_LINKS.md",
  "docs/DEEP_DIVE_FORMS.md",
  "docs/CODEBASE_REFERENCE.md",
];
const requiredTopics = {
  "docs/PLATFORM_ARCHITECTURE.md": ["Cloudflare Pages", "D1", "R2", "Firebase"],
  "docs/APPLICATION_GUIDE.md": ["Manarah", "Website", "Admin", "Links", "Forms"],
  "docs/DATA_IDENTITY_SECURITY.md": ["Firebase", "Turnstile", "R2", "secrets"],
  "docs/DEVELOPMENT_AND_RELEASE.md": ["npm run dev", "deploy", "migration"],
  "docs/OPERATIONS_GUIDE.md": ["UptimeRobot", "health", "incident"],
  "docs/SERVICE_CATALOG.md": ["PostHog", "Brevo", "Digitransit", "Cloudflare"],
  "docs/CONTRIBUTOR_PLAYBOOK.md": ["Forms", "Admin", "R2", "migration"],
  "docs/DEEP_DIVE_MANARAH.md": ["Maps", "MapLibre", "D1", "UptimeRobot"],
  "docs/DEEP_DIVE_WEBSITE.md": ["Website", "Firebase", "D1", "Cloudflare"],
  "docs/DEEP_DIVE_ADMIN.md": ["Admin", "Firebase", "React Query", "permission"],
  "docs/DEEP_DIVE_LINKS.md": ["Links", "D1", "redirect", "Admin"],
  "docs/DEEP_DIVE_FORMS.md": ["Forms", "immutable", "Firebase", "R2"],
};

const markdownLink = /\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g;
let words = 0;
for (const relative of documents) {
  const absolute = path.join(root, relative);
  const content = await readFile(absolute, "utf8");
  words += content.trim().split(/\s+/).filter(Boolean).length;
  for (const topic of requiredTopics[relative] || []) {
    if (!content.toLowerCase().includes(topic.toLowerCase())) {
      throw new Error(`${relative} must document ${topic}.`);
    }
  }
  for (const match of content.matchAll(markdownLink)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/i.test(target)) continue;
    await access(path.resolve(path.dirname(absolute), target));
  }
}

if (words < 12_000) throw new Error(`Onboarding documentation is too short (${words} words; expected at least 12,000).`);
console.log(`Documentation integrity passed (${words} words across ${documents.length} onboarding documents).`);
