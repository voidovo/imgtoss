// User preferences management for ImgToss
// Handles local storage of user preferences for different upload modes

import type { OSSProvider } from '@/lib/types'

export interface UserPreferences {
  articleUploadProvider?: OSSProvider
  imageUploadProvider?: OSSProvider
  lastUsedProvider?: OSSProvider
  duplicateCheckEnabled?: boolean
  // Add more preference keys as needed
  [key: string]: any
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

/**
 * Get a specific user preference by key
 */
export function getUserPreference(key: string): any {
  console.log(`[UserPreferences] Getting preference for key: ${key}`)
  try {
    const prefs = loadUserPreferences()
    console.log(`[UserPreferences] Current preferences:`, prefs)
    const value = prefs[key]
    console.log(`[UserPreferences] Value for ${key}:`, value)
    return value
  } catch (error) {
    console.error(`[UserPreferences] Error getting preference ${key}:`, error)
    return undefined
  }
}

/**
 * Set a specific user preference by key
 */
export function setUserPreference(key: string, value: any): void {
  console.log(`[UserPreferences] Setting preference ${key} to:`, value)
  try {
    saveUserPreferences({ [key]: value })
    console.log(`[UserPreferences] Successfully saved preference ${key}`)
  } catch (error) {
    console.error(`[UserPreferences] Error setting preference ${key}:`, error)
    throw error
  }
}