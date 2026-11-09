import { createHmac } from 'node:crypto';
/** Code TOTP (RFC 6238, SHA-1, 30 s, 6 chiffres) à partir du secret base32 renvoyé par l'enrôlement Supabase. */
export function totp(secret: string, decalage = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const cle = Buffer.from(bits.match(/.{8}/g)!.map(b => parseInt(b, 2)));
  const compteur = Buffer.alloc(8); compteur.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + decalage));
  const h = createHmac('sha1', cle).update(compteur).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
