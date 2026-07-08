import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from './card';
import { ScreenBackground } from './screen-background';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';

import { APP_NAME } from '@/constants/app-info';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEMO_USERS, useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';

// Login locale: confronta le credenziali con gli account salvati in
// client-store (creati dal coach). Nessun server dietro — vedi
// docs/DECISIONS.md per i limiti reali di questa autenticazione e il percorso
// previsto verso un backend/auth vero. Il testo in UI resta volutamente
// discorsivo: i dettagli tecnici restano in docs/report, non in questa schermata.
export function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const accounts = useClientStore((s) => s.accounts);
  const loginAsClient = useAuthStore((s) => s.loginAsClient);
  const loginAsCoach = useAuthStore((s) => s.loginAsCoach);
  const loginAsSuperadmin = useAuthStore((s) => s.loginAsSuperadmin);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleLogin() {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized || !password) {
      setError('Inserisci email e password.');
      return;
    }

    const demoUser = DEMO_USERS.find((user) => user.email === normalized && user.password === password);
    if (demoUser?.role === 'coach') {
      setError(null);
      loginAsCoach(demoUser.email);
      router.replace('/');
      return;
    }
    if (demoUser?.role === 'cliente') {
      setError(null);
      loginAsClient(demoUser.clientId ?? '1', demoUser.email);
      router.replace('/cliente-home');
      return;
    }
    if (demoUser?.role === 'superadmin') {
      setError(null);
      loginAsSuperadmin(demoUser.email);
      router.replace('/superadmin');
      return;
    }

    const account = accounts.find(
      (a) =>
        (a.email.toLowerCase() === normalized || a.username.toLowerCase() === normalized) &&
        a.temporaryPassword === password
    );
    if (!account) {
      setError('Credenziali non valide. Controlla email e password.');
      return;
    }
    setError(null);
    loginAsClient(account.clientId, account.email);
    router.replace('/cliente-home');
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
          {APP_NAME}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Accesso riservato
        </ThemedText>
      </View>

      <Card style={styles.form}>
        <ThemedText type="smallBold">Accedi al tuo account</ThemedText>
        <ThemedTextInput
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={identifier}
          onChangeText={setIdentifier}
        />
        <ThemedTextInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {error && (
          <ThemedText type="small" themeColor="statusExpired">
            {error}
          </ThemedText>
        )}
        <Pressable onPress={handleLogin}>
          <View style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" themeColor="onPrimary">
              Accedi
            </ThemedText>
          </View>
        </Pressable>
        <Pressable disabled>
          <ThemedText type="small" themeColor="textSecondary" style={styles.forgotPassword}>
            Password dimenticata?
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
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
  },
  form: {
    gap: Spacing.three,
  },
  primaryButton: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  forgotPassword: {
    textAlign: 'center',
    opacity: 0.65,
  },
});
