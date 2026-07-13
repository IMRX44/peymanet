import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/crypto";

export const SESSION_COOKIE = "peymanet_session";
const SESSION_DAYS = 30;

/** Minimal user shape the role/approval helpers need. */
type AuthUser = { role: string; approved?: boolean } | null | undefined;

/** Global admin: sees every contract, the per-user cost view, and approves users. */
export function isAdmin(user: AuthUser): boolean {
  return user?.role === "admin";
}

/**
 * Whether a user may use the app. New sign-ups are unapproved until an admin
 * approves them; admins are always considered approved (so a schema change can
 * never lock the admin out).
 */
export function isApproved(user: AuthUser): boolean {
  return !!user && (user.approved === true || user.role === "admin");
}

/** Emails that are auto-promoted to an approved admin on sign-up (comma-separated). */
function adminAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Real session auth (cookie → Session row → User). Replaces the previous demo
 * stub. Passwords are scrypt-hashed; sessions are opaque random tokens stored
 * server-side so they can be revoked.
 */
export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { token } }).catch(() => {});
    return null;
  }
  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("ابتدا وارد حساب کاربری شوید.");
  return user;
}

async function startSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function signUp(input: { email: string; password: string; name?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("ایمیل نامعتبر است.");
  if (input.password.length < 6) throw new Error("رمز عبور باید حداقل ۶ کاراکتر باشد.");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("این ایمیل قبلاً ثبت شده است.");

  // Bootstrap: the very first account (empty DB) — or any email in ADMIN_EMAILS —
  // becomes an approved admin. Everyone else registers as an unapproved member
  // and must be approved by an admin before they can use the app.
  const userCount = await prisma.user.count();
  const isBootstrapAdmin = userCount === 0 || adminAllowlist().includes(email);

  // Each new user gets their own private org (single-tenant per user).
  const org = await prisma.organization.create({
    data: { name: input.name ? `فضای کاری ${input.name}` : "فضای کاری من", slug: `org-${randomBytes(6).toString("hex")}` },
  });
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name?.trim() || email.split("@")[0],
      role: isBootstrapAdmin ? "admin" : "member",
      approved: isBootstrapAdmin,
      orgId: org.id,
      passwordHash: hashPassword(input.password),
    },
  });
  await startSession(user.id);
  return user;
}

export async function signIn(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new Error("ایمیل یا رمز عبور نادرست است.");
  }
  await startSession(user.id);
  return user;
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.delete({ where: { token } }).catch(() => {});
  store.delete(SESSION_COOKIE);
}
