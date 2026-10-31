import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

function renderBundle(bundle: string, key = "") {
  try {
    return execFileSync(
      "awk",
      ["-f", resolve(import.meta.dirname, "../env.awk")],
      {
        input: bundle,
        encoding: "utf8",
        env: {
          ...process.env,
          KANEO_TURNSTILE_SITE_KEY: key,
          KANEO_API_URL: "https://api.example.test",
          KANEO_CLIENT_URL: "https://app.example.test",
        },
      },
    );
  } catch (error) {
    // The production image runs this transform with BusyBox awk. Windows
    // contributors do not necessarily have awk installed, so exercise the
    // same literal-data safety contract with a small portable fallback.
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return bundle.replace(
        /(["'`])KANEO_TURNSTILE_SITE_KEY\1/g,
        JSON.stringify(key),
      );
    }
    throw error;
  }
}
describe("runtime environment replacement", () => {
  it("clears unset optional placeholders for every emitted literal quote", () => {
    const rendered = renderBundle(
      "globalThis.values = [\"KANEO_TURNSTILE_SITE_KEY\", 'KANEO_TURNSTILE_SITE_KEY', `KANEO_TURNSTILE_SITE_KEY`, 'https://example.test'];",
    );
    const context: { values?: string[] } = {};
    runInNewContext(rendered, context);
    expect(context.values).toEqual(["", "", "", "https://example.test"]);
  });
  it("encodes configured punctuation as literal data rather than JavaScript", () => {
    const key = '";globalThis.injected=true;//\\\n`';
    const context: { value?: string; injected?: boolean } = {};
    runInNewContext(
      renderBundle('globalThis.value = "KANEO_TURNSTILE_SITE_KEY";', key),
      context,
    );
    expect(context.value).toBe(key);
    expect(context.injected).toBeUndefined();
  });
});
