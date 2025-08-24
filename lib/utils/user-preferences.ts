// User preferences management for ImgToss
// Handles local storage of user preferences for different upload modes

import type { OSSProvider } from '@/lib/types'

export interface UserPreferences {
  articleUploadProvider?: OSSProvider
  imageUploadProvider?: OSSProvider
  lastUsedProvider?: OSSProvider
}

const PREFERENCES_KEY = 'imgtoss_user_preferences'

/**
 * Load user preferences from localStorage
 */
export function loadUserPreferences(): UserPreferences {
  try {
    if (typeof window === 'undefined') return {}
    
    const stored = localStorage.getItem(PREFERENCES_KEY)
    if (!stored) return {}
    
    return JSON.parse(stored) as UserPreferences
  } catch (error) {
    console.error('Failed to load user preferences:', error)
    return {}
  }
}

/**
 * Save user preferences to localStorage
 */
export function saveUserPreferences(preferences: Partial<UserPreferences>): void {
  try {
    if (typeof window === 'undefined') return
    
    const current = loadUserPreferences()
    const updated = { ...current, ...preferences }
    
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Failed to save user preferences:', error)
  }
}

/**
 * Get preferred provider for article upload mode
 */
export function getArticleUploadProvider(): OSSProvider | null {
  const prefs = loadUserPreferences()
  return prefs.articleUploadProvider || prefs.lastUsedProvider || null
}

/**
 * Set preferred provider for article upload mode
 */
export function setArticleUploadProvider(provider: OSSProvider): void {
  saveUserPreferences({ 
    articleUploadProvider: provider,
    lastUsedProvider: provider 
  })
}

/**
 * Get preferred provider for image upload mode
 */
export function getImageUploadProvider(): OSSProvider | null {
  const prefs = loadUserPreferences()
  return prefs.imageUploadProvider || prefs.lastUsedProvider || null
}

/**
 * Set preferred provider for image upload mode
 */
export function setImageUploadProvider(provider: OSSProvider): void {
  saveUserPreferences({ 
    imageUploadProvider: provider,
    lastUsedProvider: provider 
  })
}

/**
 * Clear all user preferences
 */
export function clearUserPreferences(): void {
  try {
    if (typeof window === 'undefined') return
    localStorage.removeItem(PREFERENCES_KEY)
  } catch (error) {
    console.error('Failed to clear user preferences:', error)
  }
}