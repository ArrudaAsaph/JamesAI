import type { UserData } from '../interfaces/user.interface.js';

export class User implements UserData {
  public readonly id: string;
  public readonly googleId: string;
  public readonly name: string | null;
  public readonly email: string;
  public readonly picture: string | null;
  public readonly createdAt: string;
  public readonly updatedAt: string;
  public readonly lastLogin: string;

  constructor(data: UserData) {
    this.id = data.id;
    this.googleId = data.googleId;
    this.name = data.name?.trim() || null;
    this.email = data.email.trim().toLowerCase();
    this.picture = data.picture;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.lastLogin = data.lastLogin;
    this.validate();
  }

  private validate(): void {
    if (!this.id || !this.googleId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      throw new Error('Dados do usuário inválidos.');
    }
  }
}
