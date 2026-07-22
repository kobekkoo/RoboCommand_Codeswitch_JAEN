import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE_MAX_AGE_SECONDS,
  ADMIN_SESSION_COOKIE,
  CONTRIBUTOR_COOKIE,
  CONTRIBUTOR_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/constants";
import { getEnv } from "@/lib/env";

function sign(value: string) {
  return createHmac("sha256", getEnv().ADMIN_SESSION_SECRET).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function getAdminSessionStatus(value?: string) {
  if (!value) return { valid: false as const };
  const [issuedAtText, signature] = value.split(".");
  if (!issuedAtText || !signature) return { valid: false as const };
  const issuedAt = Number(issuedAtText);
  if (!Number.isFinite(issuedAt)) return { valid: false as const };
  const expiresAt = issuedAt + ADMIN_COOKIE_MAX_AGE_SECONDS * 1000;
  const now = Date.now();
  if (now < issuedAt || now > expiresAt) return { valid: false as const };
  if (!safeEqual(signature, sign(issuedAtText))) return { valid: false as const };
  return {
    valid: true as const,
    issuedAt,
    expiresAt,
    secondsRemaining: Math.max(0, Math.floor((expiresAt - now) / 1000)),
  };
}

export function createAdminSessionValue(issuedAt = Date.now()) {
  const issuedAtText = issuedAt.toString();
  return `${issuedAtText}.${sign(issuedAtText)}`;
}

export function verifyAdminSessionValue(value?: string) {
  return getAdminSessionStatus(value).valid;
}

export async function setAdminCookie() {
  const jar = await cookies();
  const issuedAt = Date.now();
  jar.set(ADMIN_SESSION_COOKIE, createAdminSessionValue(issuedAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return {
    valid: true as const,
    issuedAt,
    expiresAt: issuedAt + ADMIN_COOKIE_MAX_AGE_SECONDS * 1000,
    secondsRemaining: ADMIN_COOKIE_MAX_AGE_SECONDS,
  };
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.delete(ADMIN_SESSION_COOKIE);
}

export async function isAdminRequest() {
  const jar = await cookies();
  return verifyAdminSessionValue(jar.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function getCurrentAdminSessionStatus() {
  const jar = await cookies();
  return getAdminSessionStatus(jar.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function requireAdmin() {
  if (!(await isAdminRequest())) {
    redirect("/admin/login");
  }
}

export async function getContributorCookie() {
  const jar = await cookies();
  return jar.get(CONTRIBUTOR_COOKIE)?.value;
}

export async function setContributorCookie(contributorId: string) {
  const jar = await cookies();
  jar.set(CONTRIBUTOR_COOKIE, contributorId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: CONTRIBUTOR_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
}
