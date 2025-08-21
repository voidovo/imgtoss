# Application State Management

This document describes the comprehensive state management system implemented for the imgtoss application. The system provides centralized state management, persistent user preferences, real-time synchronization with the Tauri backend, and state recovery capabilities.

## Overview

The state management system consists of several key components:

1. **AppStateProvider** - React Context provider for global application state
2. **Specialized Hooks** - Custom hooks for different aspects of state management
3. **State Recovery** - Utilities for persisting and recovering state across app restarts
4. **Real-time Sync** - Automatic synchronization between UI and Tauri backend

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                         │
├─────────────────────────────────────────────────────────────┤
│                 Specialized Hooks                           │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐  │
│  │ useAppConfig│useUserPrefs │useNotifications│useAppSync│  │
│  └─────────────┴─────────────┴─────────────┴─────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                 AppStateProvider                            │
│              (React Context + Reducer)                     │
├─────────────────────────────────────────────────────────────┤
│                 State Recovery                              │
│              (localStorage + validation)                    │
├─────────────────────────────────────────────────────────────┤
│                 Tauri Backend                               │
│         (Configuration, Progress, Health, etc.)            │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### AppStateProvider

The main context provider that manages global application state.

```typescript
import { AppStateProvider } from '@/lib';

function App() {
  return (
    <AppStateProvider>
      {/* Your app components */}
    </AppStateProvider>
  );
}
```

**State Structure:**
- `ossConfig` - OSS configuration settings
- `systemHealth` - Current system health status
- `uploadProgress` - Active upload progress tracking
- `userPreferences` - User preferences and settings
- `notifications` - Application notifications
- `errors` - Application errors
- `isInitialized` - Application initialization status
- `isOnline` - Network connectivity status
- `lastSyncTime` - Last synchronization timestamp

### useAppState Hook

Direct access to the global application state and actions.

```typescript
import { useAppState } from '@/lib';

function MyComponent() {
  const { 
    state, 
    dispatch,
    loadConfig,
    saveConfig,
    addNotification,
    syncWithBackend 
  } = useAppState();
  
  // Access state
  console.log(state.ossConfig);
  console.log(state.isInitialized);
  
  // Perform actions
  await loadConfig();
  await syncWithBackend();
}
```

## Specialized Hooks

### useAppConfig

Manages OSS configuration with validation and testing capabilities.

```typescript
import { useAppConfig } from '@/lib';

function ConfigComponent() {
  const { 
    config, 
    isLoaded, 
    isValid, 
    saveConfig, 
    testConnection,
    validateConfig,
    createDefaultConfig 
  } = useAppConfig();
  
  // Validate configuration
  const errors = validateConfig(config);
  
  // Test connection
  const isConnected = await testConnection(config);
  
  // Create default config for provider
  const defaultConfig = createDefaultConfig('Aliyun');
}
```

### useUserPreferences

Manages user preferences with persistence and import/export capabilities.

```typescript
import { useUserPreferences, useThemePreferences } from '@/lib';

function PreferencesComponent() {
  const { 
    preferences, 
    updatePreferences, 
    exportPreferences, 
    importPreferences 
  } = useUserPreferences();
  
  // Specialized theme preferences
  const { theme, setTheme } = useThemePreferences();
  
  // Update preferences
  await updatePreferences({
    theme: 'dark',
    showNotifications: true,
    defaultBatchSize: 5
  });
  
  // Export/Import
  const exported = exportPreferences();
  await importPreferences(exported);
}
```

### useAppNotifications

Manages application notifications with different types and auto-dismiss functionality.

```typescript
import { useAppNotifications } from '@/lib';

function NotificationComponent() {
  const { 
    notifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showProgress,
    dismiss,
    dismissAll 
  } = useAppNotifications();
  
  // Show different types of notifications
  showSuccess('Success!', 'Operation completed successfully');
  showError('Error!', 'Something went wrong');
  showWarning('Warning', 'Please check your settings');
  showInfo('Info', 'New feature available');
  
  // Show progress notification
  showProgress('Uploading', 'Uploading files...', 45);
  
  // Dismiss notifications
  dismiss(notificationId);
  dismissAll();
}
```

### useAppSync

Manages synchronization between UI and Tauri backend with real-time updates.

```typescript
import { useAppSync, useSyncStatus } from '@/lib';

function SyncComponent() {
  const { 
    syncNow, 
    forceFullSync, 
    enableAutoSync, 
    disableAutoSync 
  } = useAppSync();
  
  const { 
    statusText, 
    statusColor, 
    isOnline, 
    syncInProgress 
  } = useSyncStatus();
  
  // Manual sync
  await syncNow();
  
  // Force complete resync
  await forceFullSync();
  
  // Control auto-sync
  enableAutoSync();
  disableAutoSync();
}
```

## State Recovery

The state recovery system ensures application state persists across restarts and handles graceful recovery.

### Basic Usage

```typescript
import { 
  saveRecoveryState, 
  loadRecoveryState, 
  recoverApplicationState,
  setupAutoRecovery 
} from '@/lib';

// Save current state
await saveRecoveryState(
  config, 
  uploadProgress, 
  userPreferences, 
  lastSyncTime
);

// Load recovery state
const recoveryState = await loadRecoveryState();

// Recover complete application state
const recovered = await recoverApplicationState();
if (recovered.wasRecovered) {
  console.log('State recovered successfully');
}

// Setup automatic recovery saves
const cleanup = setupAutoRecovery(getStateFunction, 30000); // Every 30 seconds
```

### Recovery Options

```typescript
// Recovery with options
const recovered = await recoverApplicationState({
  includeProgress: true,
  includeConfig: true,
  includePreferences: true,
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
});

// Validate recovered state against backend
const validated = await validateRecoveredState(
  recovered.config,
  recovered.uploadProgress
);
```

## User Preferences

### Default Preferences

```typescript
const defaultPreferences = {
  theme: 'system',
  autoSaveConfig: true,
  showNotifications: true,
  defaultUploadPath: 'images/',
  defaultBatchSize: 3,
  autoBackup: true,
  compressionEnabled: false,
  compressionQuality: 80,
  duplicateCheckEnabled: true,
  autoRetryFailedUploads: true,
  maxRetryAttempts: 3,
};
```

### Specialized Preference Hooks

```typescript
// Theme preferences
const { theme, setTheme } = useThemePreferences();

// Upload preferences
const { 
  defaultUploadPath,
  defaultBatchSize,
  compressionEnabled,
  setDefaultUploadPath,
  setCompressionEnabled,
  updateUploadPreferences 
} = useUploadPreferences();

// Notification preferences
const { showNotifications, setShowNotifications } = useNotificationPreferences();

// Backup preferences
const { autoBackup, autoSaveConfig, setAutoBackup } = useBackupPreferences();
```

## Real-time Synchronization

The system automatically synchronizes state with the Tauri backend through:

1. **Event Listeners** - Real-time updates from Tauri events
2. **Periodic Sync** - Regular synchronization intervals
3. **Focus Sync** - Sync when app regains focus
4. **Online Sync** - Sync when network connectivity is restored

### Event Types

- `upload-progress` - Upload progress updates
- `system-health-update` - System health changes
- `config-changed` - Configuration changes
- `history-updated` - History record updates

## Error Handling

The state management system includes comprehensive error handling:

```typescript
// Error types
enum ErrorType {
  VALIDATION = 'validation',
  NETWORK = 'network',
  FILE_SYSTEM = 'file_system',
  SECURITY = 'security',
  SERVICE = 'service'
}

// Add errors to state
const { addError, removeError, clearAllErrors } = useAppState();

addError({
  type: ErrorType.NETWORK,
  message: 'Connection failed',
  details: 'Unable to connect to OSS provider',
  recoverable: true
});
```

## Best Practices

### 1. Use Specialized Hooks

Prefer specialized hooks over direct `useAppState` access:

```typescript
// ✅ Good
const { config, saveConfig } = useAppConfig();

// ❌ Avoid
const { state, dispatch } = useAppState();
```

### 2. Handle Loading States

Always handle loading and error states:

```typescript
const { config, isLoaded, error } = useAppConfig();

if (!isLoaded) return <Loading />;
if (error) return <Error message={error} />;
return <ConfigForm config={config} />;
```

### 3. Use Recovery for Critical State

Save important state for recovery:

```typescript
useEffect(() => {
  const cleanup = setupAutoRecovery(() => ({
    config: state.ossConfig,
    uploadProgress: state.uploadProgress,
    userPreferences: state.userPreferences,
    lastSyncTime: state.lastSyncTime
  }));
  
  return cleanup;
}, [state]);
```

### 4. Validate Recovered State

Always validate state recovered from storage:

```typescript
const recovered = await recoverApplicationState();
if (recovered.wasRecovered) {
  const validated = await validateRecoveredState(
    recovered.config,
    recovered.uploadProgress
  );
  
  if (validated.syncRequired) {
    await syncWithBackend();
  }
}
```

## Testing

The state management system includes comprehensive tests:

```bash
# Run state management tests
npm test -- lib/__tests__/app-state-management.test.ts

# Run all tests
npm test
```

## Example Implementation

See `components/examples/state-management-example.tsx` for a complete example of using all state management features.

## Migration Guide

When migrating existing components to use the new state management:

1. Wrap your app with `AppStateProvider`
2. Replace direct Tauri API calls with state management hooks
3. Use specialized hooks for specific functionality
4. Add error handling and loading states
5. Implement state recovery for critical data

```typescript
// Before
const [config, setConfig] = useState(null);
const result = await invoke('load_oss_config');

// After
const { config, loadConfig, isLoaded, error } = useAppConfig();
useEffect(() => { loadConfig(); }, []);
```