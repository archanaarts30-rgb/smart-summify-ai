import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Plan = 'free' | 'basic' | 'premium';
export type SummarySize = 'small' | 'medium' | 'large';
export type Theme = 'light' | 'dark';

export interface Summary {
  summaryId: string;
  summary: string;
  metrics: {
    inputTokens: number;
    outputTokens: number;
    originalWordCount: number;
    summaryWordCount: number;
    compressionRatio: number;
    timeSavedSec: number;
    durationMs: number;
  };
  sourceUrl?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const GUEST_FREE_LIMIT = 3;

/** Authenticated Free tier (`user.plan === 'free'`). Guests are excluded so logout preserves a paid user's length pref until login.) */
function shouldClampSummaryToSmall(user: { plan: Plan } | null): boolean {
  return user != null && user.plan === 'free';
}

export interface UsageStats {
  summariesToday:     number;
  summariesThisMonth: number;
  totalSummaries:     number;
  dailyLimit:         number | null; // null = unlimited
  /** Sum of estimate `time_saved_sec` over summaries that match Today / calendar month / all time */
  timeSavedTodaySec?:     number;
  timeSavedThisMonthSec?: number;
  timeSavedTotalSec?:     number;
}

/** Baseline usage before `/v1/users/stats` loads; also used to merge optimistic increments on the Summary tab. */
export function emptyUsageForPlan(plan: Plan): UsageStats {
  return {
    summariesToday: 0,
    summariesThisMonth: 0,
    totalSummaries: 0,
    dailyLimit: plan === 'premium' ? null : plan === 'basic' ? 50 : 3,
    timeSavedTodaySec: 0,
    timeSavedThisMonthSec: 0,
    timeSavedTotalSec: 0,
  };
}

interface AppState {
  // Auth
  user: { id: string; email: string; displayName: string; plan: Plan } | null;
  setUser: (user: AppState['user']) => void;
  clearUser: () => void;

  // Usage stats (lazy-loaded from GET /v1/users/stats when Stats / Profile open)
  usage: UsageStats | null;
  setUsage: (usage: UsageStats | null) => void;

  // Guest usage (unauthenticated free tier)
  guestSummaryCount: number;
  incrementGuestCount: () => void;
  resetGuestCount: () => void;

  // Auth modal (shown when guest hits limit or clicks Sign In)
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;

  // UI preferences
  theme: Theme;
  toggleTheme: () => void;
  fontSize: number; // px base, 14–20
  increaseFontSize: () => void;
  decreaseFontSize: () => void;

  // Summary
  summarySize: SummarySize;
  setSummarySize: (s: SummarySize) => void;
  currentSummary: Summary | null;
  setCurrentSummary: (s: Summary | null) => void;

  // Chat
  chatHistory: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;

  // Audio
  audioPlaying: boolean;
  setAudioPlaying: (v: boolean) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      setUser: (user) =>
        set(() => ({
          user,
          showAuthModal: false,
          ...(shouldClampSummaryToSmall(user) ? { summarySize: 'small' as SummarySize } : {}),
        })),
      clearUser: () => set({ user: null, usage: null, currentSummary: null, chatHistory: [], guestSummaryCount: 0 }),

      usage: null,
      setUsage: (usage) => set({ usage }),

      guestSummaryCount: 0,
      incrementGuestCount: () => set((s) => ({ guestSummaryCount: s.guestSummaryCount + 1 })),
      resetGuestCount: () => set({ guestSummaryCount: 0 }),

      showAuthModal: false,
      setShowAuthModal: (showAuthModal) => set({ showAuthModal }),

      theme: 'light',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

      fontSize: 15,
      increaseFontSize: () => set((s) => ({ fontSize: Math.min(20, s.fontSize + 1) })),
      decreaseFontSize: () => set((s) => ({ fontSize: Math.max(12, s.fontSize - 1) })),

      summarySize: 'medium',
      setSummarySize: (requested) =>
        set((s) => ({
          summarySize: shouldClampSummaryToSmall(s.user) ? 'small' : requested,
        })),

      currentSummary: null,
      setCurrentSummary: (currentSummary) => set({ currentSummary, chatHistory: [] }),

      chatHistory: [],
      addChatMessage: (msg) => set((s) => ({ chatHistory: [...s.chatHistory, msg] })),
      clearChat: () => set({ chatHistory: [] }),

      audioPlaying: false,
      setAudioPlaying: (audioPlaying) => set({ audioPlaying }),
    }),
    {
      name: 'smart-summify-store',
      partialize: (s) => ({
        theme: s.theme,
        fontSize: s.fontSize,
        summarySize: s.summarySize,
        user: s.user,
        guestSummaryCount: s.guestSummaryCount,
      }),
      merge: (persistedState: unknown, currentState: AppState) => {
        const merged = { ...currentState, ...(persistedState as Partial<AppState>) };
        if (shouldClampSummaryToSmall(merged.user)) merged.summarySize = 'small';
        return merged;
      },
    }
  )
);
