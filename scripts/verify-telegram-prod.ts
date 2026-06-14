type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

export {};

const checks: CheckResult[] = [];

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Verification failed.");
  process.exit(1);
});

async function main() {
  const baseUrl = normalizeBaseUrl(process.argv[2] ?? process.env.APP_URL_PROD);
  const telegramSecret = process.env.TELEGRAM_AGENT_SECRET?.trim();

  if (!baseUrl) {
    console.error("Usage: npm run verify:telegram:prod -- https://api.example.com");
    console.error("APP_URL_PROD can be used instead of the URL argument.");
    process.exit(1);
  }

  await check("production URL uses HTTPS", async () => {
    const parsed = new URL(baseUrl);
    return {
      ok: parsed.protocol === "https:",
      detail: parsed.protocol,
    };
  });

  await check("health endpoint", async () => {
    const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
    return {
      ok: response.ok && response.headers.get("cache-control")?.includes("no-store") === true,
      detail: `HTTP ${response.status}`,
    };
  });

  await check("clip rejects missing token", async () => {
    const response = await fetch(`${baseUrl}/api/telegram/clip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return {
      ok: response.status === 401,
      detail: `HTTP ${response.status}`,
    };
  });

  await check("clip rejects bad token", async () => {
    const response = await fetch(`${baseUrl}/api/telegram/clip`, {
      method: "POST",
      headers: {
        Authorization: "Bearer invalid-token-for-prod-check",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    return {
      ok: response.status === 401,
      detail: `HTTP ${response.status}`,
    };
  });

  await check("status rejects missing token", async () => {
    const response = await fetch(`${baseUrl}/api/telegram/clip/status?jobId=prod-check`);
    return {
      ok: response.status === 401,
      detail: `HTTP ${response.status}`,
    };
  });

  await check("publish rejects missing token", async () => {
    const response = await fetch(`${baseUrl}/api/telegram/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clips: [] }),
    });
    return {
      ok: response.status === 401,
      detail: `HTTP ${response.status}`,
    };
  });

  await check("publish rejects bad token", async () => {
    const response = await fetch(`${baseUrl}/api/telegram/publish`, {
      method: "POST",
      headers: {
        Authorization: "Bearer invalid-token-for-prod-check",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clips: [] }),
    });
    return {
      ok: response.status === 401,
      detail: `HTTP ${response.status}`,
    };
  });

  await check("public publish rejects real mode", async () => {
    const response = await fetch(`${baseUrl}/api/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "real" }),
    });
    const body = await readJsonObject(response);
    return {
      ok:
        response.status === 403 &&
        body.error === "Publication reelle disponible uniquement via /api/telegram/publish.",
      detail: `HTTP ${response.status}`,
    };
  });

  if (telegramSecret) {
    await check("status validates authorized request", async () => {
      const response = await fetch(`${baseUrl}/api/telegram/clip/status`, {
        headers: {
          Authorization: `Bearer ${telegramSecret}`,
        },
      });
      const body = await readJsonObject(response);
      return {
        ok: response.status === 400 && body.error === "jobId est requis.",
        detail: `HTTP ${response.status}`,
      };
    });

    await check("publish requires explicit confirmation", async () => {
      const response = await fetch(`${baseUrl}/api/telegram/publish`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${telegramSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clips: [] }),
      });
      const body = await readJsonObject(response);
      return {
        ok: response.status === 400 && body.error === "Confirmation humaine requise pour publier.",
        detail: `HTTP ${response.status}`,
      };
    });

    await check("publish rejects confirmed non-R2 URL", async () => {
      const response = await fetch(`${baseUrl}/api/telegram/publish`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${telegramSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmed: true,
          clips: [
            {
              id: "prod-negative-publish-check",
              title: "Negative publish check",
              description: "Must be rejected before n8n publish.",
              hashtags: ["#check"],
              videoUrl: "https://example.invalid/video.mp4",
            },
          ],
          platforms: ["youtube", "instagram"],
        }),
      });
      const body = await readJsonObject(response);
      return {
        ok:
          response.status === 400 &&
          typeof body.error === "string" &&
          body.error.includes("doit venir des previews R2"),
        detail: `HTTP ${response.status}`,
      };
    });
  } else {
    checks.push({
      name: "status validates authorized request",
      ok: true,
      detail: "skipped because TELEGRAM_AGENT_SECRET is not set locally",
    });
    checks.push({
      name: "publish requires explicit confirmation",
      ok: true,
      detail: "skipped because TELEGRAM_AGENT_SECRET is not set locally",
    });
    checks.push({
      name: "publish rejects confirmed non-R2 URL",
      ok: true,
      detail: "skipped because TELEGRAM_AGENT_SECRET is not set locally",
    });
  }

  for (const result of checks) {
    const prefix = result.ok ? "PASS" : "FAIL";
    console.log(`${prefix} ${result.name}: ${result.detail}`);
  }

  if (checks.some((result) => !result.ok)) process.exit(1);
}

async function check(name: string, run: () => Promise<{ ok: boolean; detail: string }>) {
  try {
    const result = await run();
    checks.push({ name, ...result });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : "unknown error",
    });
  }
}

function normalizeBaseUrl(value: string | undefined) {
  if (!value?.trim()) return undefined;
  return value.trim().replace(/\/+$/, "");
}

async function readJsonObject(response: Response) {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
