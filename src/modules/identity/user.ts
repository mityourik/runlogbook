export type User = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
};

export type UserWithPasswordHash = User & {
  passwordHash: string;
};
