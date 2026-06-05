import { prisma } from "@/lib/db/prisma";

/**
 * Demo auth. Returns the seeded demo user as the "current" actor so that
 * Timeline events have an author. Designed so a real Auth.js (NextAuth) session
 * can be dropped in here later without touching callers.
 */
export async function getCurrentUser() {
  const user = await prisma.user.findFirst({ where: { role: "owner" } });
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("No authenticated user (seed the database first).");
  return user;
}
