import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { DeveloperInfoSection } from '@/components/developer-info-section';
import { ScreenBackground } from '@/components/screen-background';
import { SoundSettings } from '@/components/sound-settings';
import { ThemedText } from '@/components/themed-text';
import { ThemeSettings } from '@/components/theme-settings';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/lib/auth-service';
import { useAuthStore } from '@/store/auth-store';
import { useSuperadminStore } from '@/store/superadmin-store';

export default function ImpostazioniScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const logout = useAuthStore((s) => s.logout);

  async function handleLogout() {
    await signOut();
    logout();
  }
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentCoachId = useAuthStore((s) => s.currentCoachId);
  const currentUserEmail = useAuthStore((s) => s.currentUserEmail);
  const coaches = useSuperadminStore((s) => s.coaches);
  const [copyFeedback, setCopyFeedback] = useState('');
  const coach = coaches.find((item) => item.id === currentCoachId) ?? coaches.find((item) => item.email === currentUserEmail);

  async function copyCoachCode() {
    if (!coach?.coachCode) return;
    await Clipboard.setStringAsync(coach.coachCode);
    setCopyFeedback('Codice copiato.');
  }

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

      {currentRole === 'coach' && coach ? (
        <>
          <SectionLabel>Codice coach</SectionLabel>
          <Card style={styles.codeCard}>
            <View style={styles.codeRow}>
              <View style={styles.codeText}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  {coach.coachCode}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {coach.coachCodeActive ? 'Attivo per nuove registrazioni clienti' : 'Disattivato'}
                </ThemedText>
              </View>
              <Pressable onPress={copyCoachCode} hitSlop={6}>
                <View style={[styles.copyButton, { borderColor: theme.primary }]}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    Copia
                  </ThemedText>
                </View>
              </Pressable>
            </View>
            {copyFeedback ? <ThemedText type="small" themeColor="statusActive">{copyFeedback}</ThemedText> : null}
          </Card>
        </>
      ) : null}

      <SectionLabel>Timer di recupero</SectionLabel>
      <SoundSettings />

      <DeveloperInfoSection />

      <Pressable onPress={handleLogout} hitSlop={8} style={styles.logoutButton}>
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
  codeCard: {
    gap: Spacing.two,
  },
  codeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  codeText: {
    flex: 1,
    minWidth: 0,
  },
  copyButton: {
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: Spacing.three,
  },
  logout: {
    textAlign: 'center',
  },
  logoutButton: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
});
