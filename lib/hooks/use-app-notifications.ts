// Hook for application notifications management
// Provides simplified access to notification state and actions

import { useCallback } from 'react';
import { useAppState } from '../contexts/app-state-context';
import type { ProgressNotification, NotificationType } from '../types';

export interface NotificationActions {
  showSuccess: (title: string, message: string, autoDismiss?: boolean) => void;
  showError: (title: string, message: string, autoDismiss?: boolean) => void;
  showWarning: (title: string, message: string, autoDismiss?: boolean) => void;
  showInfo: (title: string, message: string, autoDismiss?: boolean) => void;
  showProgress: (title: string, message: string, progress: number) => void;
  updateProgress: (id: string, progress: number, message?: string) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  getNotification: (id: string) => ProgressNotification | undefined;
}

export interface NotificationState {
  notifications: ProgressNotification[];
  hasNotifications: boolean;
  unreadCount: number;
  errorCount: number;
  warningCount: number;
}

export function useAppNotifications(): NotificationState & NotificationActions {
  const { 
    state, 
    addNotification, 
    removeNotification, 
    clearAllNotifications 
  } = useAppState();

  const showSuccess = useCallback((title: string, message: string, autoDismiss = true) => {
    addNotification({
      type: 'Success' as NotificationType,
      title,
      message,
      dismissible: true,
      auto_dismiss: autoDismiss,
    });
  }, [addNotification]);

  const showError = useCallback((title: string, message: string, autoDismiss = false) => {
    addNotification({
      type: 'Error' as NotificationType,
      title,
      message,
      dismissible: true,
      auto_dismiss: autoDismiss,
    });
  }, [addNotification]);

  const showWarning = useCallback((title: string, message: string, autoDismiss = false) => {
    addNotification({
      type: 'Warning' as NotificationType,
      title,
      message,
      dismissible: true,
      auto_dismiss: autoDismiss,
    });
  }, [addNotification]);

  const showInfo = useCallback((title: string, message: string, autoDismiss = true) => {
    addNotification({
      type: 'Info' as NotificationType,
      title,
      message,
      dismissible: true,
      auto_dismiss: autoDismiss,
    });
  }, [addNotification]);

  const showProgress = useCallback((title: string, message: string, progress: number) => {
    const id = `progress-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    addNotification({
      type: 'Progress' as NotificationType,
      title,
      message,
      progress,
      dismissible: false,
      auto_dismiss: progress >= 100,
    });
    return id;
  }, [addNotification]);

  const updateProgress = useCallback((id: string, progress: number, message?: string) => {
    // Find and update existing progress notification
    const existingNotification = state.notifications.find(n => n.id === id);
    if (existingNotification && existingNotification.type === 'Progress') {
      // Remove old notification and add updated one
      removeNotification(id);
      addNotification({
        type: 'Progress' as NotificationType,
        title: existingNotification.title,
        message: message || existingNotification.message,
        progress,
        dismissible: false,
        auto_dismiss: progress >= 100,
      });
    }
  }, [state.notifications, removeNotification, addNotification]);

  const dismiss = useCallback((id: string) => {
    removeNotification(id);
  }, [removeNotification]);

  const dismissAll = useCallback(() => {
    clearAllNotifications();
  }, [clearAllNotifications]);

  const getNotification = useCallback((id: string): ProgressNotification | undefined => {
    return state.notifications.find(n => n.id === id);
  }, [state.notifications]);

  // Computed state
  const hasNotifications = state.notifications.length > 0;
  const unreadCount = state.notifications.length;
  const errorCount = state.notifications.filter(n => n.type === 'Error').length;
  const warningCount = state.notifications.filter(n => n.type === 'Warning').length;

  return {
    notifications: state.notifications,
    hasNotifications,
    unreadCount,
    errorCount,
    warningCount,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showProgress,
    updateProgress,
    dismiss,
    dismissAll,
    getNotification,
  };
}

// Hook for filtering notifications by type
export function useNotificationsByType(type?: NotificationType) {
  const { notifications } = useAppNotifications();
  
  const filteredNotifications = type 
    ? notifications.filter(n => n.type === type)
    : notifications;
    
  return {
    notifications: filteredNotifications,
    count: filteredNotifications.length,
  };
}

// Hook for progress notifications specifically
export function useProgressNotifications() {
  const { notifications, updateProgress, dismiss } = useAppNotifications();
  
  const progressNotifications = notifications.filter(n => n.type === 'Progress');
  
  return {
    progressNotifications,
    activeProgressCount: progressNotifications.length,
    updateProgress,
    dismissProgress: dismiss,
  };
}