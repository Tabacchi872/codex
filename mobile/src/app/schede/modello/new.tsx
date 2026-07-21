import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BackHeader } from '@/components/ui';
import { WorkoutTemplateForm } from '@/components/workout-template-form';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { listTemplateFolders, saveWorkoutTemplate, type WorkoutTemplateSaveInput } from '@/lib/workout-plan-service';
import { supabaseConfig } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth-store';
import type { TemplateFolder } from '@/types/template-library';

// Nuova scheda modello nella libreria globale del coach. folderId (se
// presente) e' la cartella da cui il coach ha premuto "+ Scheda modello" —
// mai un clientId: questa schermata non ne accetta e non ne legge mai uno.
export default function NuovoModelloScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { folderId } = useLocalSearchParams<{ folderId?: string }>();
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');
  const [folders, setFolders] = useState<TemplateFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoadingFolders(true);
      listTemplateFolders().then((result) => {
        if (cancelled) return;
        if (result.ok) setFolders(result.data);
        setLoadingFolders(false);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!isCoach) {
    return <CoachOnlyNotice />;
  }

  async function handleSave(input: Omit<WorkoutTemplateSaveInput, 'id'>) {
    if (!supabaseConfig.isConfigured) {
      setError("Supabase non e' configurato: impossibile salvare la libreria modelli.");
      return;
    }
    setError('');
    setSaving(true);
    const result = await saveWorkoutTemplate(input);
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace(`/schede/modello/${result.data.id}`);
  }

  const backHref = folderId ? (`/schede/cartella/${folderId}` as const) : '/schede';

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          },
        ]}>
        <BackHeader title="Nuova scheda modello" fallbackHref={backHref} />
        {loadingFolders ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              Caricamento cartelle…
            </ThemedText>
          </View>
        ) : (
          <WorkoutTemplateForm initialFolderId={folderId ?? null} folders={folders} onSave={handleSave} saveLabel="Crea scheda modello" />
        )}
        {saving ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              Salvataggio scheda modello su Supabase…
            </ThemedText>
          </View>
        ) : null}
        {error ? (
          <ThemedText type="small" themeColor="statusExpired">
            {error}
          </ThemedText>
        ) : null}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
