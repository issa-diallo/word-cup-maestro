import { afterEach, describe, expect, it } from "vitest";
import {
  envPresence,
  getEnv,
  getNumberEnv,
  getPipelineMode,
  hasEnv,
  redactSecrets,
  requireEnv,
} from "../../lib/env";

const touched = new Set<string>();

function setEnv(name: string, value: string | undefined) {
  touched.add(name);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const key of touched) delete process.env[key];
  touched.clear();
});

describe("env helpers", () => {
  it("trims present values and treats blank strings as missing", () => {
    setEnv("UNIT_VALUE", "  hello  ");
    setEnv("UNIT_BLANK", "   ");

    expect(getEnv("UNIT_VALUE")).toBe("hello");
    expect(hasEnv("UNIT_VALUE")).toBe(true);
    expect(getEnv("UNIT_BLANK")).toBeUndefined();
    expect(hasEnv("UNIT_BLANK")).toBe(false);
  });

  it("throws a named error for missing required variables", () => {
    setEnv("UNIT_REQUIRED", undefined);

    expect(() => requireEnv("UNIT_REQUIRED")).toThrow("UNIT_REQUIRED est requis.");
  });

  it("parses positive numeric variables and falls back for invalid values", () => {
    setEnv("UNIT_NUMBER", "42");
    setEnv("UNIT_NEGATIVE", "-1");
    setEnv("UNIT_TEXT", "abc");

    expect(getNumberEnv("UNIT_NUMBER", 7)).toBe(42);
    expect(getNumberEnv("UNIT_NEGATIVE", 7)).toBe(7);
    expect(getNumberEnv("UNIT_TEXT", 7)).toBe(7);
    expect(getNumberEnv("UNIT_MISSING", 7)).toBe(7);
  });

  it("defaults non-real pipeline modes to dry-run", () => {
    expect(getPipelineMode()).toBe("dry-run");
    expect(getPipelineMode("preview")).toBe("dry-run");
    expect(getPipelineMode("real")).toBe("real");
  });

  it("redacts nested secret-like keys while preserving safe values", () => {
    expect(
      redactSecrets({
        token: "abc",
        nested: [{ apiKey: "123", title: "safe" }],
        count: 2,
      }),
    ).toEqual({
      token: "[redacted]",
      nested: [{ apiKey: "[redacted]", title: "safe" }],
      count: 2,
    });
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets("plain")).toBe("plain");
  });

  it("reports env presence by key", () => {
    setEnv("UNIT_PRESENT", "yes");
    setEnv("UNIT_ABSENT", undefined);

    expect(envPresence(["UNIT_PRESENT", "UNIT_ABSENT"])).toEqual({
      UNIT_PRESENT: true,
      UNIT_ABSENT: false,
    });
  });
});
