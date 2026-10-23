/** Converts Prisma objects (Decimal etc.) to plain JSON-safe values. */
import type { Prisma } from "@prisma/client";

export function plainify(value: unknown): Prisma.InputJsonValue {
  const parsed = JSON.parse(JSON.stringify(value, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (v && typeof v === "object" && typeof (v as { d?: unknown }).d === "object" && typeof (v as { s?: unknown }).s === "number") {
      return String(v);
    }
    return v;
  }));
  return parsed;
}
