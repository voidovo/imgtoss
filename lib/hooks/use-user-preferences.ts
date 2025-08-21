// Hook for user preferences management
// Provides simplified access to user preferences state and actions

import { useCallback } from 'react';
import { useAppState, type UserPreferences } from '../contexts/app-state-context';

export interface PreferencesActions {
  updatePreferences: (preferences: Partial<UserPreferences>) => Promise<void>;
  resetPreferences: () => Promise<void>;
  exportPreferences: () => string;
  importPreferences: (data: string) => Promise<void>;
  getPreference: <K extends keyof UserPreferences>(key: K) => UserPreferences[K];
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => Promise<void>;
}

export interface PreferencesState {
  preferences: UserPreferences;
  isLoaded: boolean;
}

export function useUserPreferences(): PreferencesState & PreferencesActions {
  const { 
    state, 
    saveUserPreferences, 
    resetUserPreferences,
    addError,
  } = useAppState();

  const updatePreferences = useCallback(async (preferences: Partial<UserPreferences>) => {
    await saveUserPreferences(preferences);
  }, [saveUserPreferences]);

  const resetPreferences = useCallback(async () => {
    await resetUserPreferences();
  }, [resetUserPreferences]);

  const exportPreferences = useCallback((): string => {
    return JSON.stringify(state.userPreferences, null, 2);
  }, [state.userPreferences]);

  const importPreferences = useCallback(async (data: string) => {
    try {
      const preferences = JSON.parse(data) as Partial<UserPreferences>;
      
      // Validate the imported preferences
      const validKeys = [
        'theme', 'autoSaveConfig', 'showNotifications', 'defaultUploadPath',
        'defaultBatchSize', 'autoBackup', 'compressionEnabled', 'compressionQuality',
        'duplicateCheckEnabled', 'autoRetryFailedUploads', 'maxRetryAttempts'
      ];
      
      const filteredPreferences: Partial<UserPreferences> = {};
      for (const [key, value] of Object.entries(preferences)) {
        if (validKeys.includes(key)) {
          (filteredPreferences as any)[key] = value;
        }
      }
      
      await saveUserPreferences(filteredPreferences);
    } catch (error) {
      addError({
        type: 'VALIDATION' as any,
        message: 'Failed to import preferences',
        details: error instanceof Error ? error.message : 'Invalid JSON format',
        recoverable: true,
      });
      throw error;
    }
  }, [saveUserPreferences, addError]);

  const getPreference = useCallback(<K extends keyof UserPreferences>(key: K): UserPreferences[K] => {
    return state.userPreferences[key];
  }, [state.userPreferences]);

  const setPreference = useCallback(async <K extends keyof UserPreferences>(
    key: K, 
    value: UserPreferences[K]
  ) => {
    await saveUserPreferences({ [key]: value } as Partial<UserPreferences>);
  }, [saveUserPreferences]);

  return {
    preferences: state.userPreferences,
    isLoaded: state.preferencesLoaded,
    updatePreferences,
    resetPreferences,
    exportPreferences,
    importPreferences,
    getPreference,
    setPreference,
  };
}

// Specialized hooks for common preference categories
export function useThemePreferences() {
  const { getPreference, setPreference } = useUserPreferences();
  
  return {
    theme: getPreference('theme'),
    setTheme: (theme: 'light' | 'dark' | 'system') => setPreference('theme', theme),
  };
}

export function useUploadPreferences() {
  const { getPreference, setPreference, updatePreferences } = useUserPreferences();
  
  return {
    defaultUploadPath: getPreference('defaultUploadPath'),
    defaultBatchSize: getPreference('defaultBatchSize'),
    compressionEnabled: getPreference('compressionEnabled'),
    compressionQuality: getPreference('compressionQuality'),
    duplicateCheckEnabled: getPreference('duplicateCheckEnabled'),
    autoRetryFailedUploads: getPreference('autoRetryFailedUploads'),
    maxRetryAttempts: getPreference('maxRetryAttempts'),
    
    setDefaultUploadPath: (path: string) => setPreference('defaultUploadPath', path),
    setDefaultBatchSize: (size: number) => setPreference('defaultBatchSize', size),
    setCompressionEnabled: (enabled: boolean) => setPreference('compressionEnabled', enabled),
    setCompressionQuality: (quality: number) => setPreference('compressionQuality', quality),
    setDuplicateCheckEnabled: (enabled: boolean) => setPreference('duplicateCheckEnabled', enabled),
    setAutoRetryFailedUploads: (enabled: boolean) => setPreference('autoRetryFailedUploads', enabled),
    setMaxRetryAttempts: (attempts: number) => setPreference('maxRetryAttempts', attempts),
    
    updateUploadPreferences: (preferences: {
      defaultUploadPath?: string;
      defaultBatchSize?: number;
      compressionEnabled?: boolean;
      compressionQuality?: number;
      duplicateCheckEnabled?: boolean;
      autoRetryFailedUploads?: boolean;
      maxRetryAttempts?: number;
    }) => updatePreferences(preferences),
  };
}

export function useNotificationPreferences() {
  const { getPreference, setPreference } = useUserPreferences();
  
  return {
    showNotifications: getPreference('showNotifications'),
    setShowNotifications: (enabled: boolean) => setPreference('showNotifications', enabled),
  };
}

export function useBackupPreferences() {
  const { getPreference, setPreference } = useUserPreferences();
  
  return {
    autoBackup: getPreference('autoBackup'),
    autoSaveConfig: getPreference('autoSaveConfig'),
    setAutoBackup: (enabled: boolean) => setPreference('autoBackup', enabled),
    setAutoSaveConfig: (enabled: boolean) => setPreference('autoSaveConfig', enabled),
  };
}