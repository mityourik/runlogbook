import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const algorithm = 'aes-256-gcm';

export function encryptSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const key = createKey(secret);
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(value: string, secret: string): string {
  const [iv, authTag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  const key = createKey(secret);
  const decipher = createDecipheriv(algorithm, key, iv);

  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function createKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}
