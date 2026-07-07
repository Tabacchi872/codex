import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeveloperInfoSection } from '@/components/developer-info-section';
import { ScreenBackground } from '@/components/screen-background';
import { SoundSettings } from '@/components/sound-settings';
import { ThemedText } from '@/components/themed-text';
import { ThemeSettings } from '@/components/theme-settings';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/store/auth-store';

export default function ImpostazioniScreen() {
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);

  return (
    <ScreenBackground>
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}>
      <View style={styles.titleBlock}>
        <ThemedText type="title" style={styles.title}>
          Impostazioni
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Aspetto, suoni e vibrazione
        </ThemedText>
      </View>

      <SectionLabel>Tema</SectionLabel>
      <ThemeSettings />

      <SectionLabel>Timer di recupero</SectionLabel>
      <SoundSettings />

      <DeveloperInfoSection />

      <Pressable onPress={logout}>
        <ThemedText type="small" themeColor="statusExpired" style={styles.logout}>
          Esci
        </ThemedText>
      </Pressable>
    </ScrollView>
    </ScreenBackground>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
      {children.toUpperCase()}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  titleBlock: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  sectionLabel: {
    marginTop: Spacing.two,
    letterSpacing: 0.4,
  },
  logout: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
