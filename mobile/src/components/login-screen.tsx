import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from './card';
import { ScreenBackground } from './screen-background';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';

import { APP_NAME } from '@/constants/app-info';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadClientProfile, signInWithEmail } from '@/lib/auth-service';
import { supabaseConfig } from '@/lib/supabase';
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
  const clients = useClientStore((s) => s.clients);
  const addClient = useClientStore((s) => s.addClient);
  const updateClient = useClientStore((s) => s.updateClient);
  const addAccount = useClientStore((s) => s.addAccount);
  const updateAccount = useClientStore((s) => s.updateAccount);
  const coachAccounts = useAuthStore((s) => s.coachAccounts);
  const loginAsClient = useAuthStore((s) => s.loginAsClient);
  const loginAsCoach = useAuthStore((s) => s.loginAsCoach);
  const loginAsSuperadmin = useAuthStore((s) => s.loginAsSuperadmin);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized || !password) {
      setError('Inserisci email e password.');
      return;
    }

    // Se Supabase e' configurato, prova prima l'accesso reale. Se fallisce
    // (account demo locale non presente su Supabase, credenziali di un coach/
    // cliente creato solo in locale, ecc.) si ricade sui controlli locali
    // sotto invece di bloccare l'utente — vedi docs/DECISIONS.md.
    if (supabaseConfig.isConfigured) {
      setSubmitting(true);
      const result = await signInWithEmail(normalized, password);
      setSubmitting(false);
      if (result.ok) {
        setError(null);
        const { role } = result.data;
        if (role === 'coach') {
          const localAccount = coachAccounts.find((account) => account.email.toLowerCase() === normalized);
          loginAsCoach(normalized, localAccount?.coachId);
          router.replace('/');
          return;
        }
        if (role === 'cliente') {
          // Ricarica sempre client_profiles/coach_clients da Supabase (fonte di
          // verita'), invece di fidarsi solo del mirror locale: quest'ultimo
          // puo' non esistere se la registrazione e' avvenuta su un altro
          // device/browser (AsyncStorage web e Expo Go non condividono lo
          // storage) — vedi lib/auth-service.ts, loadClientProfile.
          const userId = result.data.session.user.id;
          const profileResult = await loadClientProfile(userId, normalized);
          if (!profileResult.ok) {
            setError(profileResult.message);
            return;
          }
          const { client } = profileResult.data;
          if (clients.some((c) => c.id === client.id)) {
            updateClient(client);
          } else {
            addClient(client);
          }
          const existingAccount = accounts.find((a) => a.clientId === client.id);
          if (existingAccount) {
            updateAccount({ ...existingAccount, email: normalized, username: normalized, mustChangePassword: false });
          } else {
            addAccount({
              id: `acc-${client.id}`,
              clientId: client.id,
              username: normalized,
              email: normalized,
              temporaryPassword: password,
              role: 'cliente',
              mustChangePassword: false,
              status: 'active',
              createdAt: new Date().toISOString(),
            });
          }
          loginAsClient(client.id, normalized);
          router.replace('/cliente-home');
          return;
        }
        if (role === 'superadmin') {
          loginAsSuperadmin(normalized);
          router.replace('/superadmin' as Href);
          return;
        }
      }
    }

    const demoUser = DEMO_USERS.find((user) => user.email === normalized && user.password === password);
    if (demoUser?.role === 'coach') {
      setError(null);
      loginAsCoach(demoUser.email, demoUser.coachId);
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
      router.replace('/superadmin' as Href);
      return;
    }

    const coachAccount = coachAccounts.find((account) => account.email.toLowerCase() === normalized && account.password === password);
    if (coachAccount) {
      setError(null);
      loginAsCoach(coachAccount.email, coachAccount.coachId);
      router.replace('/');
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
        <Pressable onPress={handleLogin} disabled={submitting} hitSlop={6}>
          <View style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: submitting ? 0.6 : 1 }]}>
            <ThemedText type="smallBold" themeColor="onPrimary">
              {submitting ? 'Accesso...' : 'Accedi'}
            </ThemedText>
          </View>
        </Pressable>
        <Pressable disabled hitSlop={6}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.forgotPassword}>
            Password dimenticata?
          </ThemedText>
        </Pressable>
        <View style={styles.registerLinks}>
          <Pressable onPress={() => router.push('/registrazione-coach' as Href)} hitSlop={6}>
            <ThemedText type="smallBold" themeColor="primary" style={styles.registerLink}>
              Registrati come coach
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => router.push('/registrazione-cliente' as Href)} hitSlop={6}>
            <ThemedText type="smallBold" themeColor="primary" style={styles.registerLink}>
              Registrati come cliente
            </ThemedText>
          </Pressable>
        </View>
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
    minHeight: 48,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  forgotPassword: {
    textAlign: 'center',
    opacity: 0.65,
  },
  registerLinks: {
    gap: Spacing.two,
  },
  registerLink: {
    textAlign: 'center',
  },
});
