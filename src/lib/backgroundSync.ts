import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { syncRunsToSupabase } from './health';

const BACKGROUND_SYNC_TASK = 'BACKGROUND_RUNNING_SYNC';
const SYNC_THROTTLE_MS = 60 * 60 * 1000; // 1시간
const STORAGE_KEY_LAST_SYNC = 'lastSyncTimestamp';
const STORAGE_KEY_MEMBER = 'selectedMember';

// ---------- Throttle helpers ----------

async function getLastSyncTimestamp(): Promise<number> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY_LAST_SYNC);
  return stored ? Number(stored) : 0;
}

async function setLastSyncTimestamp(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_LAST_SYNC, String(Date.now()));
  await AsyncStorage.setItem('lastSync', new Date().toLocaleString('ko-KR'));
}

async function shouldSync(): Promise<boolean> {
  const last = await getLastSyncTimestamp();
  return Date.now() - last > SYNC_THROTTLE_MS;
}

// ---------- Core sync (used by both background & foreground) ----------

async function performSync(): Promise<number> {
  const memberJson = await AsyncStorage.getItem(STORAGE_KEY_MEMBER);
  if (!memberJson) return 0;

  const member = JSON.parse(memberJson);
  const count = await syncRunsToSupabase(member.id);
  await setLastSyncTimestamp();
  return count;
}

// ---------- Background Task ----------

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    if (!(await shouldSync())) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const count = await performSync();

    return count > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    console.warn('Background sync failed', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15 * 60, // 최소 15분 (OS가 실제 간격 결정)
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log('Background sync registered');
  } catch (e) {
    console.warn('Background sync registration failed', e);
  }
}

export async function unregisterBackgroundSync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }
  } catch (e) {
    console.warn('Background sync unregister failed', e);
  }
}

// ---------- Foreground auto-sync (AppState) ----------

let appStateSubscription: { remove: () => void } | null = null;

export function startForegroundAutoSync(onSyncComplete?: (count: number) => void): void {
  if (appStateSubscription) return; // already listening

  let previousState: AppStateStatus = AppState.currentState;

  appStateSubscription = AppState.addEventListener('change', async (nextState) => {
    // Only trigger when coming back to foreground
    if (previousState.match(/inactive|background/) && nextState === 'active') {
      try {
        if (await shouldSync()) {
          const count = await performSync();
          onSyncComplete?.(count);
        }
      } catch (e) {
        console.warn('Foreground auto-sync failed', e);
      }
    }
    previousState = nextState;
  });
}

export function stopForegroundAutoSync(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
}

// ---------- Manual sync (for button) ----------

export { performSync };
