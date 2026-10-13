import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Removes everything this device keeps for one account (M7.1, after the account is deleted):
 * every `focus-forest/<store>/v<n>/<user id>` entry and what hangs under it (a store's
 * `/quarantine` copy of unreadable data). Other accounts' entries stay.
 */
export async function forgetDeviceData(
  userId: string,
  storage: Pick<typeof AsyncStorage, 'getAllKeys' | 'multiRemove'> = AsyncStorage,
): Promise<void> {
  const keys = await storage.getAllKeys();
  const mine = keys.filter((key) => {
    const [app, , version, owner] = key.split('/');
    return app === 'focus-forest' && /^v\d+$/.test(version ?? '') && owner === userId;
  });
  if (mine.length > 0) await storage.multiRemove(mine);
}
