import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/crypto";

export const SESSION_COOKIE = "peymanet_session";
const SESSION_DAYS = 30;

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

  // Each new user gets their own private org (single-tenant per user).
  const org = await prisma.organization.create({
    data: { name: input.name ? `فضای کاری ${input.name}` : "فضای کاری من", slug: `org-${randomBytes(6).toString("hex")}` },
  });
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name?.trim() || email.split("@")[0],
      role: "owner",
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
