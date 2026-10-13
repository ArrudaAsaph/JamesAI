export interface UserData {
  id: string;
  googleId: string;
  name: string | null;
  email: string;
  picture: string | null;
  createdAt: string;
  updatedAt: string;
  lastLogin: string;
}

export interface UserRow extends Omit<UserData, 'createdAt' | 'updatedAt' | 'lastLogin'> {
  createdAt: Date;
  updatedAt: Date;
  lastLogin: Date;
}
