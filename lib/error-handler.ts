// Error handling utilities for Tauri command responses
// Provides structured error handling and user-friendly error messages

import { AppError, ErrorType } from './types';

/**
 * Custom error class for Tauri API errors
 */
export class TauriError extends Error {
  public readonly type: ErrorType;
  public readonly details?: string;
  public readonly code?: string;
  public readonly recoverable: boolean;

  constructor(error: AppError) {
    super(error.message);
    this.name = 'TauriError';
    this.type = error.type;
    this.details = error.details;
    this.code = error.code;
    this.recoverable = error.recoverable;
  }
}

/**
 * Parse and classify Tauri command errors
 */
export function parseTauriError(error: unknown): TauriError {
  // If it's already a TauriError, return as-is
  if (error instanceof TauriError) {
    return error;
  }

  // If it's a string error from Tauri command
  if (typeof error === 'string') {
    return new TauriError(classifyStringError(error));
  }

  // If it's an Error object
  if (error instanceof Error) {
    return new TauriError({
      type: ErrorType.SERVICE,
      message: error.message,
      details: error.stack,
      recoverable: true,
    });
  }

  // If it's an object with error information
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    return new TauriError({
      type: (errorObj.type as ErrorType) || ErrorType.SERVICE,
      message: (errorObj.message as string) || 'Unknown error occurred',
      details: errorObj.details as string,
      code: errorObj.code as string,
      recoverable: (errorObj.recoverable as boolean) ?? true,
    });
  }

  // Fallback for unknown error types
  return new TauriError({
    type: ErrorType.SERVICE,
    message: 'An unknown error occurred',
    details: String(error),
    recoverable: true,
  });
}

/**
 * Classify string errors from Tauri commands into structured errors
 */
function classifyStringError(errorMessage: string): AppError {
  const message = errorMessage.toLowerCase();

  // Validation errors
  if (
    message.includes('cannot be empty') ||
    message.includes('invalid') ||
    message.includes('too many') ||
    message.includes('must be') ||
    message.includes('format')
  ) {
    return {
      type: ErrorType.VALIDATION,
      message: errorMessage,
      recoverable: true,
    };
  }

  // Network errors
  if (
    message.includes('connection') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('unreachable') ||
    message.includes('dns')
  ) {
    return {
      type: ErrorType.NETWORK,
      message: errorMessage,
      recoverable: true,
    };
  }

  // File system errors
  if (
    message.includes('file not found') ||
    message.includes('permission denied') ||
    message.includes('no such file') ||
    message.includes('directory') ||
    message.includes('path')
  ) {
    return {
      type: ErrorType.FILE_SYSTEM,
      message: errorMessage,
      recoverable: true,
    };
  }

  // Security errors
  if (
    message.includes('rate limit') ||
    message.includes('security') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('path traversal')
  ) {
    return {
      type: ErrorType.SECURITY,
      message: errorMessage,
      recoverable: false,
    };
  }

  // Default to service error
  return {
    type: ErrorType.SERVICE,
    message: errorMessage,
    recoverable: true,
  };
}

/**
 * Get user-friendly error messages with recovery suggestions
 */
export function getUserFriendlyErrorMessage(error: TauriError): {
  title: string;
  message: string;
  suggestions: string[];
} {
  switch (error.type) {
    case ErrorType.VALIDATION:
      return {
        title: 'Invalid Input',
        message: error.message,
        suggestions: [
          'Please check your input and try again',
          'Make sure all required fields are filled',
          'Verify that file paths and formats are correct',
        ],
      };

    case ErrorType.NETWORK:
      return {
        title: 'Network Error',
        message: 'Unable to connect to the storage service',
        suggestions: [
          'Check your internet connection',
          'Verify your storage provider settings',
          'Try again in a few moments',
          'Check if the storage service is accessible',
        ],
      };

    case ErrorType.FILE_SYSTEM:
      return {
        title: 'File System Error',
        message: error.message,
        suggestions: [
          'Make sure the file exists and is accessible',
          'Check file permissions',
          'Verify the file path is correct',
          'Try selecting a different file',
        ],
      };

    case ErrorType.SECURITY:
      return {
        title: 'Security Error',
        message: 'Operation blocked for security reasons',
        suggestions: [
          'Please wait before trying again',
          'Make sure you have proper permissions',
          'Contact support if the issue persists',
        ],
      };

    case ErrorType.SERVICE:
    default:
      return {
        title: 'Service Error',
        message: error.message || 'An unexpected error occurred',
        suggestions: [
          'Try the operation again',
          'Restart the application if the problem persists',
          'Check the application logs for more details',
        ],
      };
  }
}

/**
 * Wrapper function for Tauri API calls with error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const tauriError = parseTauriError(error);
    
    // Add context to error if provided
    if (context) {
      tauriError.message = `${context}: ${tauriError.message}`;
    }
    
    throw tauriError;
  }
}

/**
 * Retry wrapper for recoverable operations
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
  context?: string
): Promise<T> {
  let lastError: TauriError | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withErrorHandling(operation, context);
    } catch (error) {
      lastError = error instanceof TauriError ? error : parseTauriError(error);
      
      // Don't retry non-recoverable errors
      if (!lastError.recoverable) {
        throw lastError;
      }
      
      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }

  throw lastError;
}

/**
 * Batch operation error handler
 */
export interface BatchOperationResult<T> {
  successful: T[];
  failed: Array<{
    item: unknown;
    error: TauriError;
  }>;
}

/**
 * Execute batch operations with individual error handling
 */
export async function executeBatchOperation<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  context?: string
): Promise<BatchOperationResult<R>> {
  const successful: R[] = [];
  const failed: Array<{ item: T; error: TauriError }> = [];

  await Promise.allSettled(
    items.map(async (item) => {
      try {
        const result = await withErrorHandling(() => operation(item), context);
        successful.push(result);
      } catch (error) {
        const tauriError = error instanceof TauriError ? error : parseTauriError(error);
        failed.push({ item, error: tauriError });
      }
    })
  );

  return { successful, failed };
}

/**
 * Error logging utility
 */
export function logError(error: TauriError, context?: string): void {
  const logData = {
    timestamp: new Date().toISOString(),
    context,
    type: error.type,
    message: error.message,
    details: error.details,
    code: error.code,
    recoverable: error.recoverable,
    stack: error.stack,
  };

  console.error('Tauri API Error:', logData);
  
  // In a real application, you might want to send this to a logging service
  // or store it locally for debugging purposes
}

/**
 * Create a standardized error response for UI components
 */
export interface ErrorResponse {
  hasError: boolean;
  error?: TauriError;
  userMessage?: {
    title: string;
    message: string;
    suggestions: string[];
  };
}

export function createErrorResponse(error?: unknown): ErrorResponse {
  if (!error) {
    return { hasError: false };
  }

  const tauriError = error instanceof TauriError ? error : parseTauriError(error);
  const userMessage = getUserFriendlyErrorMessage(tauriError);

  return {
    hasError: true,
    error: tauriError,
    userMessage,
  };
}