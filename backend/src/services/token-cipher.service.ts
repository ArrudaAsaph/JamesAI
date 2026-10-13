import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class TokenCipherService {
  private readonly key: Buffer;

  constructor(key: string) {
    if (!/^[a-f0-9]{64}$/i.test(key)) {
      throw new Error('TOKEN_ENCRYPTION_KEY deve conter 64 caracteres hexadecimais.');
    }
    this.key = Buffer.from(key, 'hex');
  }

  public encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }

  public decrypt(value: string): string {
    const data = Buffer.from(value, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
  }
}
