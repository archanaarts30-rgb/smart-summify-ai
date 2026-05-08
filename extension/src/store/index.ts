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

export interface UsageStats {
  summariesToday:     number;
  summariesThisMonth: number;
  totalSummaries:     number;
  dailyLimit:         number | null; // null = unlimited
}

interface AppState {
  // Auth
  user: { id: string; email: string; displayName: string; plan: Plan } | null;
  setUser: (user: AppState['user']) => void;
  clearUser: () => void;

  // Usage stats (fetched from /v1/users/me)
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
      setUser: (user) => set({ user, showAuthModal: false }),
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
      setSummarySize: (summarySize) => set({ summarySize }),

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
    }
  )
);
