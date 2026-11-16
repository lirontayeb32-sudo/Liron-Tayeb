/** Password hashing with scrypt (Node built-in; no native dependencies). */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

function derive(password: string, salt: Buffer, n = N, r = R, p = P): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים`);
  }
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), +n, +r, +p);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
