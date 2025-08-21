// Hook for OSS configuration management
// Provides simplified access to configuration state and actions

import { useCallback } from 'react';
import { useAppState } from '../contexts/app-state-context';
import type { OSSConfig, OSSProvider } from '../types';

export interface ConfigActions {
  loadConfig: () => Promise<void>;
  saveConfig: (config: OSSConfig) => Promise<void>;
  testConnection: (config: OSSConfig) => Promise<boolean>;
  clearConfig: () => void;
  validateConfig: (config: Partial<OSSConfig>) => string[];
  createDefaultConfig: (provider: OSSProvider) => Partial<OSSConfig>;
}

export interface ConfigState {
  config: OSSConfig | null;
  isLoaded: boolean;
  error: string | null;
  isValid: boolean;
}

export function useAppConfig(): ConfigState & ConfigActions {
  const { 
    state, 
    dispatch, 
    loadConfig, 
    saveConfig, 
    testConnection 
  } = useAppState();

  const clearConfig = useCallback(() => {
    dispatch({ type: 'SET_OSS_CONFIG', payload: null });
  }, [dispatch]);

  const validateConfig = useCallback((config: Partial<OSSConfig>): string[] => {
    const errors: string[] = [];

    if (!config.provider) {
      errors.push('Provider is required');
    }

    if (!config.endpoint || config.endpoint.trim() === '') {
      errors.push('Endpoint is required');
    }

    if (!config.access_key_id || config.access_key_id.trim() === '') {
      errors.push('Access Key ID is required');
    }

    if (!config.access_key_secret || config.access_key_secret.trim() === '') {
      errors.push('Access Key Secret is required');
    }

    if (!config.bucket || config.bucket.trim() === '') {
      errors.push('Bucket name is required');
    }

    if (!config.region || config.region.trim() === '') {
      errors.push('Region is required');
    }

    if (!config.path_template || config.path_template.trim() === '') {
      errors.push('Path template is required');
    }

    if (config.compression_quality !== undefined) {
      if (config.compression_quality < 1 || config.compression_quality > 100) {
        errors.push('Compression quality must be between 1 and 100');
      }
    }

    // Validate endpoint format
    if (config.endpoint && !config.endpoint.startsWith('http')) {
      errors.push('Endpoint must start with http:// or https://');
    }

    // Validate bucket name format (basic validation)
    if (config.bucket) {
      const bucketRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
      if (config.bucket.length < 3 || config.bucket.length > 63) {
        errors.push('Bucket name must be between 3 and 63 characters');
      } else if (!bucketRegex.test(config.bucket)) {
        errors.push('Bucket name contains invalid characters');
      }
    }

    return errors;
  }, []);

  const createDefaultConfig = useCallback((provider: OSSProvider): Partial<OSSConfig> => {
    const baseConfig = {
      provider,
      endpoint: '',
      access_key_id: '',
      access_key_secret: '',
      bucket: '',
      region: '',
      path_template: 'images/{year}/{month}/{filename}',
      compression_enabled: false,
      compression_quality: 80,
    };

    switch (provider) {
      case 'Aliyun':
        return {
          ...baseConfig,
          endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
          region: 'cn-hangzhou',
        };
      case 'Tencent':
        return {
          ...baseConfig,
          endpoint: 'https://cos.ap-beijing.myqcloud.com',
          region: 'ap-beijing',
        };
      case 'AWS':
        return {
          ...baseConfig,
          endpoint: 'https://s3.amazonaws.com',
          region: 'us-east-1',
        };
      default:
        return baseConfig;
    }
  }, []);

  const isValid = state.ossConfig ? validateConfig(state.ossConfig).length === 0 : false;

  return {
    config: state.ossConfig,
    isLoaded: state.isConfigLoaded,
    error: state.configError,
    isValid,
    loadConfig,
    saveConfig,
    testConnection,
    clearConfig,
    validateConfig,
    createDefaultConfig,
  };
}