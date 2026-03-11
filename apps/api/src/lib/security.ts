import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const HASH_ROUNDS = 12;

export const hashPassword = async (plain: string): Promise<string> => {
  return bcrypt.hash(plain, HASH_ROUNDS);
};

export const verifyPassword = async (plain: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(plain, hash);
};

export const hashToken = (token: string): string => {
  return createHash("sha256").update(token).digest("hex");
};

export const generateOpaqueToken = (prefix: string): { plain: string; hash: string; keyPrefix: string } => {
  const random = randomBytes(24).toString("hex");
  const keyPrefix = random.slice(0, 10);
  const plain = `${prefix}_${keyPrefix}_${random}`;
  return {
    plain,
    hash: hashToken(plain),
    keyPrefix
  };
};
