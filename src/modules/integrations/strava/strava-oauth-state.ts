import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type StravaOAuthState = {
  userId: string;
  nonce: string;
};

export function createStravaOAuthState(userId: string, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, nonce: randomBytes(16).toString('base64url') }),
    'utf8'
  ).toString('base64url');
  const signature = sign(payload, secret);

  return `${payload}.${signature}`;
}

export function parseStravaOAuthState(state: string, secret: string): StravaOAuthState | null {
  const [payload, signature] = state.split('.');

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = sign(payload, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as StravaOAuthState;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
