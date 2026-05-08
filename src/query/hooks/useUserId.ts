import { db } from '@/src/db/instant';

export function useUserId() {
  const auth = db?.useAuth?.();
  return auth?.user?.id ?? null;
}

