import type { CacheService } from '../common/cache/cache.service';

/** TTL corto: la consistencia la garantiza invalidación en mutaciones. */
export const INVENTORY_SUMMARY_TTL_MS = 60_000;

export function inventorySummaryCacheKey(profileId: string): string {
  return `inventory:summary:${profileId}`;
}

export async function invalidateInventorySummary(
  cache: CacheService,
  profileId: string,
): Promise<void> {
  await cache.del(inventorySummaryCacheKey(profileId));
}
