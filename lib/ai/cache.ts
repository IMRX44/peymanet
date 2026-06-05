import { prisma } from "@/lib/db/prisma";
import { contentHash } from "@/lib/utils";

export function cacheKey(task: string, model: string, input: string): string {
  return `${task}:${model}:${contentHash(input)}`;
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const row = await prisma.aiCache.findUnique({ where: { key } });
    return row ? (JSON.parse(row.responseJson) as T) : null;
  } catch {
    return null;
  }
}

export async function setCached(key: string, task: string, model: string, value: unknown): Promise<void> {
  try {
    await prisma.aiCache.upsert({
      where: { key },
      create: { key, task, model, responseJson: JSON.stringify(value) },
      update: { responseJson: JSON.stringify(value) },
    });
  } catch {
    // cache is best-effort
  }
}
