// Hook for application state synchronization
// Provides utilities for syncing state between UI and Tauri backend

import { useCallback, useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useAppState } from '../contexts/app-state-context';
import type { UploadProgress, SystemHealth } from '../types';

export interface SyncActions {
  syncNow: () => Promise<void>;
  enableAutoSync: () => void;
  disableAutoSync: () => void;
  forceFullSync: () => Promise<void>;
  getLastSyncTime: () => Date | null;
  isSyncing: () => boolean;
}

export interface SyncState {
  isOnline: boolean;
  lastSyncTime: Date | null;
  autoSyncEnabled: boolean;
  syncInProgress: boolean;
}

export function useAppSync(): SyncState & SyncActions {
  const { 
    state, 
    syncWithBackend, 
    updateUploadProgress, 
    refreshSystemHealth,
    addNotification,
  } = useAppState();

  const autoSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventListenersRef = useRef<UnlistenFn[]>([]);
  const syncInProgressRef = useRef(false);

  // Sync with backend
  const syncNow = useCallback(async () => {
    if (syncInProgressRef.current) return;
    
    syncInProgressRef.current = true;
    try {
      await syncWithBackend();
    } finally {
      syncInProgressRef.current = false;
    }
  }, [syncWithBackend]);

  // Force a complete synchronization
  const forceFullSync = useCallback(async () => {
    if (syncInProgressRef.current) return;
    
    syncInProgressRef.current = true;
    try {
      // Clear all local state and reload from backend
      await syncWithBackend();
      
      addNotification({
        type: 'Success' as any,
        title: 'Sync Complete',
        message: 'Application state has been synchronized with backend',
        dismissible: true,
        auto_dismiss: true,
      });
    } catch (error) {
      addNotification({
        type: 'Error' as any,
        title: 'Sync Failed',
        message: 'Failed to synchronize with backend',
        dismissible: true,
        auto_dismiss: false,
      });
      throw error;
    } finally {
      syncInProgressRef.current = false;
    }
  }, [syncWithBackend, addNotification]);

  // Enable automatic synchronization
  const enableAutoSync = useCallback(() => {
    if (autoSyncIntervalRef.current) return;
    
    // Sync every 30 seconds when online
    autoSyncIntervalRef.current = setInterval(() => {
      if (state.isOnline && !syncInProgressRef.current) {
        syncNow();
      }
    }, 30000);
  }, [state.isOnline, syncNow]);

  // Disable automatic synchronization
  const disableAutoSync = useCallback(() => {
    if (autoSyncIntervalRef.current) {
      clearInterval(autoSyncIntervalRef.current);
      autoSyncIntervalRef.current = null;
    }
  }, []);

  const getLastSyncTime = useCallback(() => {
    return state.lastSyncTime;
  }, [state.lastSyncTime]);

  const isSyncing = useCallback(() => {
    return syncInProgressRef.current;
  }, []);

  // Set up real-time event listeners
  useEffect(() => {
    const setupEventListeners = async () => {
      try {
        // Listen for upload progress events
        const progressUnlisten = await listen<UploadProgress>('upload-progress', (event) => {
          const progress = event.payload;
          updateUploadProgress(progress.image_id, progress);
        });

        // Listen for system health updates
        const healthUnlisten = await listen<SystemHealth>('system-health-update', (event) => {
          const health = event.payload;
          // Update system health in state
          refreshSystemHealth();
        });

        // Listen for configuration changes
        const configUnlisten = await listen('config-changed', () => {
          // Reload configuration when it changes
          syncNow();
        });

        // Listen for history updates
        const historyUnlisten = await listen('history-updated', () => {
          // Refresh history statistics
          syncNow();
        });

        eventListenersRef.current = [
          progressUnlisten,
          healthUnlisten,
          configUnlisten,
          historyUnlisten,
        ];
      } catch (error) {
        console.error('Failed to setup event listeners:', error);
      }
    };

    setupEventListeners();

    return () => {
      // Cleanup event listeners
      eventListenersRef.current.forEach(unlisten => {
        try {
          unlisten();
        } catch (error) {
          console.error('Failed to cleanup event listener:', error);
        }
      });
      eventListenersRef.current = [];
    };
  }, [updateUploadProgress, refreshSystemHealth, syncNow]);

  // Auto-enable sync when component mounts
  useEffect(() => {
    enableAutoSync();
    
    return () => {
      disableAutoSync();
    };
  }, [enableAutoSync, disableAutoSync]);

  // Sync when coming back online
  useEffect(() => {
    if (state.isOnline && state.isInitialized) {
      syncNow();
    }
  }, [state.isOnline, state.isInitialized, syncNow]);

  // Sync when window regains focus (user returns to app)
  useEffect(() => {
    const handleFocus = () => {
      if (state.isOnline && state.isInitialized) {
        syncNow();
      }
    };

    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [state.isOnline, state.isInitialized, syncNow]);

  return {
    isOnline: state.isOnline,
    lastSyncTime: state.lastSyncTime,
    autoSyncEnabled: autoSyncIntervalRef.current !== null,
    syncInProgress: syncInProgressRef.current,
    syncNow,
    enableAutoSync,
    disableAutoSync,
    forceFullSync,
    getLastSyncTime,
    isSyncing,
  };
}

// Hook for monitoring sync status
export function useSyncStatus() {
  const { isOnline, lastSyncTime, syncInProgress } = useAppSync();
  
  const getSyncStatusText = useCallback(() => {
    if (syncInProgress) return 'Syncing...';
    if (!isOnline) return 'Offline';
    if (!lastSyncTime) return 'Never synced';
    
    const now = new Date();
    const diffMs = now.getTime() - lastSyncTime.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    
    if (diffMinutes < 1) return 'Just synced';
    if (diffMinutes < 60) return `Synced ${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Synced ${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `Synced ${diffDays}d ago`;
  }, [syncInProgress, isOnline, lastSyncTime]);

  const getSyncStatusColor = useCallback(() => {
    if (syncInProgress) return 'blue';
    if (!isOnline) return 'red';
    if (!lastSyncTime) return 'yellow';
    
    const now = new Date();
    const diffMs = now.getTime() - lastSyncTime.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    
    if (diffMinutes < 5) return 'green';
    if (diffMinutes < 30) return 'yellow';
    return 'orange';
  }, [syncInProgress, isOnline, lastSyncTime]);

  return {
    isOnline,
    lastSyncTime,
    syncInProgress,
    statusText: getSyncStatusText(),
    statusColor: getSyncStatusColor(),
  };
}