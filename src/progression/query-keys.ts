/** Owned badges and the showcase (GET /me/badges). */
export const badgesQueryKey = ['me', 'badges'] as const;

/** Achievements with the server's progress (GET /me/achievements). */
export const achievementsQueryKey = ['me', 'achievements'] as const;

/** Owned species and whether the month's choice is open (GET /me/species). */
export const speciesQueryKey = ['me', 'species'] as const;

/** The equipped garden and profile frame (GET /me/equipment). */
export const equipmentQueryKey = ['me', 'equipment'] as const;

/** The derived Collection Book (GET /me/collection). */
export const collectionQueryKey = ['me', 'collection'] as const;
