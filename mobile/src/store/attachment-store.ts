import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ExerciseAttachment } from '@/types/attachment';

type AttachmentState = {
  attachments: ExerciseAttachment[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  addAttachment: (attachment: ExerciseAttachment) => void;
  removeAttachment: (id: string) => void;
  // Azzera gli allegati dell'account precedente al logout. Vedi auth-store.ts.
  reset: () => void;
};

export const useAttachmentStore = create<AttachmentState>()(
  persist(
    (set) => ({
      attachments: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      addAttachment: (attachment) => set((s) => ({ attachments: [...s.attachments, attachment] })),
      removeAttachment: (id) => set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) })),
      reset: () => set({ attachments: [] }),
    }),
    {
      name: 'fitcoach-attachment-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
