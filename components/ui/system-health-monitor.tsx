"use client";

import React from 'react';
import { 
  Activity, 
  HardDrive, 
  Cpu, 
  Upload, 
  AlertCircle, 
  CheckCircle, 
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { SystemHealth, HealthError } from '@/lib/types';
import { HealthStatus } from '@/lib/types';

interface SystemHealthMonitorProps {
  health: SystemHealth | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  className?: string;
}

const HealthStatusIcon = ({ status }: { status: HealthStatus }) => {
  switch (status) {
    case HealthStatus.Healthy:
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case HealthStatus.Warning:
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case HealthStatus.Critical:
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    default:
      return <Activity className="h-5 w-5 text-gray-500" />;
  }
};

const getStatusColor = (status: HealthStatus) => {
  switch (status) {
    case HealthStatus.Healthy:
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case HealthStatus.Warning:
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case HealthStatus.Critical:
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUptime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

export function SystemHealthMonitor({ 
  health, 
  isLoading = false, 
  onRefresh, 
  className 
}: SystemHealthMonitorProps) {
  if (!health && !isLoading) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-gray-500 dark:text-gray-400">
              No health data available
            </p>
            {onRefresh && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onRefresh}
                className="mt-2"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Health
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Health
          </CardTitle>
          <div className="flex items-center gap-2">
            {health && (
              <Badge className={getStatusColor(health.status)}>
                <HealthStatusIcon status={health.status} />
                <span className="ml-1">{health.status}</span>
              </Badge>
            )}
            {onRefresh && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2"></div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          </div>
        ) : health ? (
          <>
            {/* System Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Cpu className="h-4 w-4 text-blue-500" />
                  Memory Usage
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {formatBytes(health.memory_usage)}
                </div>
                <Progress 
                  value={Math.min((health.memory_usage / 2_000_000_000) * 100, 100)} 
                  className="h-2" 
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <HardDrive className="h-4 w-4 text-green-500" />
                  Disk Space
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {formatBytes(health.disk_space)} available
                </div>
                <Progress 
                  value={Math.min((health.disk_space / 10_000_000_000) * 100, 100)} 
                  className="h-2" 
                />
              </div>
            </div>
            
            {/* Additional Metrics */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-purple-500" />
                  Uptime
                </div>
                <span className="text-sm font-medium">
                  {formatUptime(health.uptime)}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Upload className="h-4 w-4 text-orange-500" />
                  Active Uploads
                </div>
                <span className="text-sm font-medium">
                  {health.active_uploads}
                </span>
              </div>
            </div>
            
            {/* Health Errors */}
            {health.errors.length > 0 && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Health Issues ({health.errors.length})
                </h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {health.errors.map((error, index) => (
                    <HealthErrorItem key={index} error={error} />
                  ))}
                </div>
              </div>
            )}
            
            {/* Last Check */}
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Last checked: {new Date(health.last_check).toLocaleString()}
              </p>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface HealthErrorItemProps {
  error: HealthError;
}

function HealthErrorItem({ error }: HealthErrorItemProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Critical':
        return 'text-red-600 dark:text-red-400';
      case 'High':
        return 'text-orange-600 dark:text-orange-400';
      case 'Medium':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'Low':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-2">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">{error.component}</span>
            <Badge 
              variant="outline" 
              className={cn("text-xs", getSeverityColor(error.severity))}
            >
              {error.severity}
            </Badge>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {error.message}
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
        {new Date(error.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}

// Compact system health indicator for status bars
interface SystemHealthIndicatorProps {
  health: SystemHealth | null;
  onClick?: () => void;
  className?: string;
}

export function SystemHealthIndicator({ 
  health, 
  onClick, 
  className 
}: SystemHealthIndicatorProps) {
  if (!health) {
    return (
      <div className={cn("flex items-center gap-2 text-gray-500", className)}>
        <Activity className="h-4 w-4" />
        <span className="text-sm">Unknown</span>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md px-2 py-1 transition-colors",
        className
      )}
    >
      <HealthStatusIcon status={health.status} />
      <span className="text-sm font-medium">{health.status}</span>
      {health.active_uploads > 0 && (
        <Badge variant="secondary" className="text-xs">
          {health.active_uploads}
        </Badge>
      )}
    </button>
  );
}