"use client"

// Example component demonstrating application state management usage
// Shows how to use the various state management hooks and utilities

import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  useAppState, 
  useAppConfig, 
  useUserPreferences, 
  useAppNotifications,
  useAppSync,
  useSyncStatus,
} from '@/lib';
import { CheckCircle, AlertCircle, Wifi, WifiOff, Settings, Bell, Upload } from 'lucide-react';

export function StateManagementExample() {
  const { state, initialize } = useAppState();
  const { config, isValid: isConfigValid, loadConfig } = useAppConfig();
  const { preferences, updatePreferences } = useUserPreferences();
  const { 
    showSuccess, 
    showError, 
    showInfo, 
    notifications, 
    dismissAll 
  } = useAppNotifications();
  const { syncNow, forceFullSync } = useAppSync();
  const { statusText, statusColor, isOnline } = useSyncStatus();

  // Initialize the application state on mount
  useEffect(() => {
    if (!state.isInitialized) {
      initialize();
    }
  }, [state.isInitialized, initialize]);

  const handleTestNotifications = () => {
    showSuccess('Success!', 'This is a success notification');
    showError('Error!', 'This is an error notification');
    showInfo('Info', 'This is an info notification');
  };

  const handleToggleTheme = async () => {
    const newTheme = preferences.theme === 'dark' ? 'light' : 'dark';
    await updatePreferences({ theme: newTheme });
    showInfo('Theme Changed', `Switched to ${newTheme} theme`);
  };

  const handleToggleNotifications = async () => {
    const newValue = !preferences.showNotifications;
    await updatePreferences({ showNotifications: newValue });
    showInfo('Settings Updated', `Notifications ${newValue ? 'enabled' : 'disabled'}`);
  };

  const getStatusColor = (color: string) => {
    switch (color) {
      case 'green': return 'bg-green-500';
      case 'yellow': return 'bg-yellow-500';
      case 'orange': return 'bg-orange-500';
      case 'red': return 'bg-red-500';
      case 'blue': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">State Management Example</h1>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
          <Badge variant="outline" className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${getStatusColor(statusColor)}`} />
            {statusText}
          </Badge>
        </div>
      </div>

      {/* Application Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Application Status
          </CardTitle>
          <CardDescription>
            Current state of the application and its components
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              {state.isInitialized ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-yellow-500" />
              )}
              <span className="text-sm">
                {state.isInitialized ? 'Initialized' : 'Initializing...'}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {isConfigValid ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-sm">
                {isConfigValid ? 'Config Valid' : 'Config Invalid'}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {isOnline ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-sm">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span className="text-sm">
                {state.activeUploads} Active Uploads
              </span>
            </div>
          </div>

          {state.lastSyncTime && (
            <div className="text-sm text-muted-foreground">
              Last sync: {state.lastSyncTime.toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration Status */}
      {config && (
        <Card>
          <CardHeader>
            <CardTitle>OSS Configuration</CardTitle>
            <CardDescription>
              Current object storage service configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Provider:</span> {config.provider}
              </div>
              <div>
                <span className="font-medium">Bucket:</span> {config.bucket}
              </div>
              <div>
                <span className="font-medium">Region:</span> {config.region}
              </div>
              <div>
                <span className="font-medium">Compression:</span> {config.compression_enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* User Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            User Preferences
          </CardTitle>
          <CardDescription>
            Current user preferences and settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Theme:</span> {preferences.theme}
            </div>
            <div>
              <span className="font-medium">Notifications:</span> {preferences.showNotifications ? 'Enabled' : 'Disabled'}
            </div>
            <div>
              <span className="font-medium">Batch Size:</span> {preferences.defaultBatchSize}
            </div>
            <div>
              <span className="font-medium">Auto Backup:</span> {preferences.autoBackup ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleToggleTheme} variant="outline" size="sm">
              Toggle Theme
            </Button>
            <Button onClick={handleToggleNotifications} variant="outline" size="sm">
              Toggle Notifications
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Upload Progress */}
      {state.uploadProgress.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Progress
            </CardTitle>
            <CardDescription>
              Current upload operations in progress
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from(state.uploadProgress.entries()).map(([imageId, progress]) => (
              <div key={imageId} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="truncate">{imageId}</span>
                  <span>{Math.round(progress.progress)}%</span>
                </div>
                <Progress value={progress.progress} className="h-2" />
                {progress.speed && (
                  <div className="text-xs text-muted-foreground">
                    Speed: {(progress.speed / 1024).toFixed(1)} KB/s
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications ({notifications.length})
          </CardTitle>
          <CardDescription>
            Current application notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications</p>
          ) : (
            <>
              {notifications.slice(0, 3).map((notification) => (
                <Alert key={notification.id}>
                  <AlertDescription>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{notification.title}</div>
                        <div className="text-sm">{notification.message}</div>
                      </div>
                      <Badge variant="outline">{notification.type}</Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
              {notifications.length > 3 && (
                <p className="text-sm text-muted-foreground">
                  And {notifications.length - 3} more...
                </p>
              )}
            </>
          )}
          
          <div className="flex gap-2">
            <Button onClick={handleTestNotifications} variant="outline" size="sm">
              Test Notifications
            </Button>
            {notifications.length > 0 && (
              <Button onClick={dismissAll} variant="outline" size="sm">
                Clear All
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* System Actions */}
      <Card>
        <CardHeader>
          <CardTitle>System Actions</CardTitle>
          <CardDescription>
            Actions to manage application state and synchronization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button onClick={syncNow} variant="outline" size="sm">
              Sync Now
            </Button>
            <Button onClick={forceFullSync} variant="outline" size="sm">
              Force Full Sync
            </Button>
            <Button onClick={loadConfig} variant="outline" size="sm">
              Reload Config
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {state.errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Errors ({state.errors.length})</CardTitle>
            <CardDescription>
              Current application errors that need attention
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {state.errors.map((error) => (
              <Alert key={error.code} variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium">{error.message}</div>
                  {error.details && (
                    <div className="text-sm mt-1">{error.details}</div>
                  )}
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}