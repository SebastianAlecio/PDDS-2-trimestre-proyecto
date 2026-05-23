import { describe, expect, it } from "vitest";
import { deriveSla } from "./sla";

describe("deriveSla", () => {
  const base = new Date("2026-05-22T12:00:00.000Z");

  it("alta -> 1 hora hábil, dueAt = +1h", () => {
    const { label, dueAt, hours } = deriveSla("alta", base);
    expect(label).toBe("1 hora hábil");
    expect(hours).toBe(1);
    expect(dueAt.toISOString()).toBe("2026-05-22T13:00:00.000Z");
  });

  it("media -> 4 horas hábiles, dueAt = +4h", () => {
    const { label, dueAt, hours } = deriveSla("media", base);
    expect(label).toBe("4 horas hábiles");
    expect(hours).toBe(4);
    expect(dueAt.toISOString()).toBe("2026-05-22T16:00:00.000Z");
  });

  it("baja -> 1 día hábil, dueAt = +24h", () => {
    const { label, dueAt, hours } = deriveSla("baja", base);
    expect(label).toBe("1 día hábil");
    expect(hours).toBe(24);
    expect(dueAt.toISOString()).toBe("2026-05-23T12:00:00.000Z");
  });
});
