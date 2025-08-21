"use client";

import React from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import type { ProgressNotification } from '@/lib/types';
import { NotificationType } from '@/lib/types';

interface NotificationProps {
  notification: ProgressNotification;
  onDismiss: (id: string) => void;
}

const NotificationIcon = ({ type }: { type: NotificationType }) => {
  switch (type) {
    case NotificationType.Success:
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case NotificationType.Error:
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    case NotificationType.Warning:
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case NotificationType.Progress:
      return <Info className="h-5 w-5 text-blue-500" />;
    default:
      return <Info className="h-5 w-5 text-blue-500" />;
  }
};

const getNotificationStyles = (type: NotificationType) => {
  switch (type) {
    case NotificationType.Success:
      return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950';
    case NotificationType.Error:
      return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950';
    case NotificationType.Warning:
      return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950';
    case NotificationType.Progress:
      return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950';
    default:
      return 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950';
  }
};

export function NotificationItem({ notification, onDismiss }: NotificationProps) {
  const handleDismiss = () => {
    onDismiss(notification.id);
  };

  return (
    <div
      className={cn(
        "relative rounded-lg border p-4 shadow-sm transition-all duration-300 ease-in-out",
        getNotificationStyles(notification.type)
      )}
    >
      <div className="flex items-start gap-3">
        <NotificationIcon type={notification.type} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {notification.title}
            </h4>
            {notification.dismissible && (
              <button
                onClick={handleDismiss}
                className="ml-2 inline-flex text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {notification.message}
          </p>
          
          {notification.progress !== undefined && (
            <div className="mt-2">
              <Progress value={notification.progress} className="h-2" />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                {Math.round(notification.progress)}% complete
              </p>
            </div>
          )}
          
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
            {new Date(notification.timestamp).toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  );
}

interface NotificationSystemProps {
  notifications: ProgressNotification[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function NotificationSystem({ 
  notifications, 
  onDismiss, 
  onClearAll, 
  className 
}: NotificationSystemProps) {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className={cn("fixed top-4 right-4 z-50 w-80 space-y-2", className)}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Notifications ({notifications.length})
        </h3>
        {notifications.length > 1 && (
          <button
            onClick={onClearAll}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Clear all
          </button>
        )}
      </div>
      
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}

// Compact notification for progress monitoring
interface ProgressNotificationProps {
  progress: Map<string, import('@/lib/types').UploadProgress>;
  onCancel?: (taskId: string) => void;
  className?: string;
}

export function ProgressNotificationCompact({ 
  progress, 
  onCancel, 
  className 
}: ProgressNotificationProps) {
  const progressArray = Array.from(progress.values());
  
  if (progressArray.length === 0) {
    return null;
  }

  const totalProgress = progressArray.reduce((sum, p) => sum + p.progress, 0) / progressArray.length;
  const activeUploads = progressArray.filter(p => p.progress < 100).length;
  const completedUploads = progressArray.filter(p => p.progress >= 100).length;

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 min-w-80",
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Upload Progress
        </h4>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {completedUploads}/{progressArray.length} complete
        </div>
      </div>
      
      <Progress value={totalProgress} className="h-2 mb-2" />
      
      <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
        {activeUploads > 0 ? (
          `${activeUploads} active upload${activeUploads !== 1 ? 's' : ''}`
        ) : (
          'All uploads complete'
        )}
      </div>
      
      {activeUploads > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {progressArray
            .filter(p => p.progress < 100)
            .map((p) => (
              <div key={p.image_id} className="flex items-center justify-between text-xs">
                <span className="truncate flex-1 mr-2">
                  Image {p.image_id.slice(0, 8)}...
                </span>
                <div className="flex items-center gap-2">
                  <span>{Math.round(p.progress)}%</span>
                  {onCancel && (
                    <button
                      onClick={() => onCancel(p.image_id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}