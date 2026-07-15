import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from './card';
import { ScreenBackground } from './screen-background';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { requestPasswordReset } from '@/lib/auth-service';
import { getWebRedirectUrl } from '@/lib/redirect-url';

// Nessuna email manuale dall'app, nessuna secret key nel client: chiama solo
// supabase.auth.resetPasswordForEmail. Se Supabase non e' configurato non c'e'
// un fallback locale (non e' mai esistito un reset password demo) — l'errore
// di lib/auth-service.ts viene mostrato cosi' com'e', nessun crash.
export function ForgotPasswordScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError('Inserisci la tua email.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const redirectTo = getWebRedirectUrl('/reimposta-password');
    const result = await requestPasswordReset(normalized, redirectTo);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSent(true);
  }

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? Spacing.six : insets.top + Spacing.five, paddingBottom: Spacing.six },
        ]}>
        <View style={styles.titleBlock}>
          <ThemedText type="title" style={styles.title}>
            Password dimenticata
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Inserisci la tua email: ti mandiamo un link per reimpostare la password.
          </ThemedText>
        </View>

        <Card style={styles.form}>
          {sent ? (
            <ThemedText type="small" themeColor="statusActive">
              Ti abbiamo inviato un&apos;email per reimpostare la password.
            </ThemedText>
          ) : (
            <>
              <ThemedTextInput
                placeholder="Email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              {error && (
                <ThemedText type="small" themeColor="statusExpired">
                  {error}
                </ThemedText>
              )}
              <Pressable onPress={handleSubmit} disabled={submitting} hitSlop={6}>
                <View style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: submitting ? 0.6 : 1 }]}>
                  <ThemedText type="smallBold" themeColor="onPrimary">
                    {submitting ? 'Invio...' : 'Invia email di reset'}
                  </ThemedText>
                </View>
              </Pressable>
            </>
          )}
          <Pressable onPress={() => router.replace('/' as Href)} hitSlop={6}>
            <ThemedText type="smallBold" themeColor="primary" style={styles.centerText}>
              Torna al login
            </ThemedText>
          </Pressable>
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    flexGrow: 1,
    justifyContent: 'center',
  },
  titleBlock: {
    gap: 4,
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  form: {
    gap: Spacing.three,
  },
  primaryButton: {
    borderRadius: Radius.md,
    minHeight: 48,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
});
