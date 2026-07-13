import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppScreen, AppTextField } from '@/components/ui';
import { APP_NAME } from '@/constants/app-info';
import { ensureClientOnboarding, ensureCoachOnboarding, loadClientProfile, signInWithEmail } from '@/lib/auth-service';
import { supabaseConfig } from '@/lib/supabase';
import { DEMO_USERS, useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';

// Login locale: confronta le credenziali con gli account salvati in
// client-store (creati dal coach). Nessun server dietro — vedi
// docs/DECISIONS.md per i limiti reali di questa autenticazione e il percorso
// previsto verso un backend/auth vero. Il testo in UI resta volutamente
// discorsivo: i dettagli tecnici restano in docs/report, non in questa schermata.
export function LoginScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const accounts = useClientStore((s) => s.accounts);
  const clients = useClientStore((s) => s.clients);
  const addClient = useClientStore((s) => s.addClient);
  const updateClient = useClientStore((s) => s.updateClient);
  const addAccount = useClientStore((s) => s.addAccount);
  const updateAccount = useClientStore((s) => s.updateAccount);
  const coachAccounts = useAuthStore((s) => s.coachAccounts);
  const localCoaches = useSuperadminStore((s) => s.coaches);
  const updateCoach = useSuperadminStore((s) => s.updateCoach);
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
    // sotto invece di bloccare l'utente — vedi docs/DECISIONS.md. Il messaggio
    // reale di Supabase viene pero' salvato: se anche i controlli locali sotto
    // falliscono, mostrarlo al posto del generico "Credenziali non valide" e'
    // l'unico modo per l'utente (e per il debug) di sapere se Supabase ha
    // davvero rifiutato quella password (es. dopo un reset password) invece di
    // limitarsi a "non trovato da nessuna parte".
    let supabaseErrorMessage: string | null = null;

    if (supabaseConfig.isConfigured) {
      setSubmitting(true);
      const result = await signInWithEmail(normalized, password);
      setSubmitting(false);
      // Errore specifico e reale (l'account Supabase esiste ma l'email non e'
      // ancora confermata): non deve ricadere sui controlli locali sotto, che
      // darebbero il generico "Credenziali non valide" e nasconderebbero il
      // vero motivo del blocco.
      if (!result.ok && result.code === 'email_not_confirmed') {
        setError('Email non ancora confermata. Controlla la tua casella di posta e clicca il link di conferma prima di accedere.');
        return;
      }
      if (result.ok) {
        setError(null);
        const { role } = result.data;
        const userId = result.data.session.user.id;
        const metadata = result.data.session.user.user_metadata ?? {};
        if (role === 'coach') {
          // Best-effort: se il coach si era registrato con "Confirm email"
          // attivo, coach_profiles/billing_profiles/registration_codes
          // potrebbero non essere mai stati creati (nessuna sessione al
          // momento della registrazione). Riprova qui, ora che la sessione
          // esiste; se fallisce (es. account vecchio senza billing_profile in
          // user_metadata) non blocca comunque il login.
          const onboarding = await ensureCoachOnboarding(userId, metadata);
          const localAccount = coachAccounts.find((account) => account.email.toLowerCase() === normalized);
          if (onboarding.ok && localAccount?.coachId) {
            // Se la registrazione era rimasta "in sospeso" (Confirm email),
            // il mirror locale aveva un codice segnaposto mai scritto su
            // Supabase (registration_codes creato solo ora, con un codice
            // nuovo): allinea il mirror al codice reale, altrimenti
            // Impostazioni mostrerebbe al coach un codice che i clienti non
            // potrebbero mai usare per registrarsi.
            const localCoach = localCoaches.find((coach) => coach.id === localAccount.coachId);
            if (localCoach && localCoach.coachCode !== onboarding.data.coachCode) {
              updateCoach(localAccount.coachId, { coachCode: onboarding.data.coachCode, coachCodeActive: true });
            }
          }
          loginAsCoach(normalized, localAccount?.coachId, result.data.mustChangePassword);
          router.replace('/');
          return;
        }
        if (role === 'cliente') {
          // Stesso fallback lato cliente: completa client_profiles/coach_clients
          // se mancano (Confirm email attivo in fase di registrazione), usando
          // coach_id/coach_code salvati in user_metadata — non li richiediamo di
          // nuovo all'utente. Poi ricarica sempre client_profiles/coach_clients
          // da Supabase (fonte di verita'), invece di fidarsi solo del mirror
          // locale: quest'ultimo puo' non esistere se la registrazione e'
          // avvenuta su un altro device/browser (AsyncStorage web e Expo Go non
          // condividono lo storage) — vedi lib/auth-service.ts, loadClientProfile.
          await ensureClientOnboarding(metadata);
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
          loginAsClient(client.id, normalized, result.data.mustChangePassword);
          router.replace('/cliente-home');
          return;
        }
        if (role === 'superadmin') {
          loginAsSuperadmin(normalized);
          router.replace('/superadmin' as Href);
          return;
        }
      } else {
        supabaseErrorMessage = result.message;
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
      setError(
        supabaseErrorMessage
          ? `Accesso non riuscito: ${supabaseErrorMessage}`
          : 'Credenziali non valide. Controlla email e password.',
      );
      return;
    }
    setError(null);
    loginAsClient(account.clientId, account.email);
    router.replace('/cliente-home');
  }

  return (
    <AppScreen contentStyle={styles.content} bottomTabInset={false}>
      <View style={styles.titleBlock}>
        <Text style={[AppTextStyle.hero, styles.title, { color: colors.ink }]}>{APP_NAME}</Text>
        <Text style={[styles.subtitle, { color: colors.inkSoft }]}>Accesso riservato</Text>
      </View>

      <AppCard style={styles.form}>
        <Text style={[styles.formTitle, { color: colors.ink }]}>Accedi al tuo account</Text>
        <AppTextField
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={identifier}
          onChangeText={setIdentifier}
        />
        <AppTextField placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {error ? <Text style={[styles.error, { color: colors.rust }]}>{error}</Text> : null}
        <AppButton label={submitting ? 'Accesso...' : 'Accedi'} onPress={handleLogin} loading={submitting} fullWidth size="lg" />
        <Pressable onPress={() => router.push('/password-dimenticata' as Href)} hitSlop={6}>
          <Text style={[styles.forgotPassword, { color: colors.inkSoft }]}>Password dimenticata?</Text>
        </Pressable>
        <View style={styles.registerLinks}>
          <Pressable onPress={() => router.push('/registrazione-coach' as Href)} hitSlop={6}>
            <Text style={[styles.registerLink, { color: colors.moss }]}>Registrati come coach</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/registrazione-cliente' as Href)} hitSlop={6}>
            <Text style={[styles.registerLink, { color: colors.moss }]}>Registrati come cliente</Text>
          </Pressable>
        </View>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  titleBlock: {
    gap: 4,
    alignItems: 'center',
    marginBottom: AppSpacing[6],
  },
  title: {
    fontSize: 32,
  },
  subtitle: {
    fontSize: AppFontSize.base,
    fontWeight: '600',
  },
  form: {
    gap: AppSpacing[3],
  },
  formTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  error: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  forgotPassword: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  registerLinks: {
    gap: AppSpacing[2],
    marginTop: AppSpacing[1],
  },
  registerLink: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
});
