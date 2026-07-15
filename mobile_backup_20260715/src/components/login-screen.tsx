import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton, AppScreen, FitCoachLogo } from '@/components/ui';
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
  const [passwordVisible, setPasswordVisible] = useState(false);

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
    <AppScreen contentStyle={styles.content} bottomTabInset={false} keyboardAvoiding>
      <View style={styles.glowLayer} pointerEvents="none">
        <View style={[styles.beam, { backgroundColor: colors.moss }]} />
        <View style={[styles.beamSoft, { backgroundColor: colors.mossSoft }]} />
      </View>

      <View style={styles.titleBlock}>
        <FitCoachLogo size="lg" />
        <Text style={[styles.subtitle, { color: colors.inkSoft }]}>Accedi al tuo spazio allenamento.</Text>
      </View>

      <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[AppTextStyle.title, styles.formTitle, { color: colors.ink }]}>Bentornato</Text>
        <Text style={[styles.formSubtitle, { color: colors.inkSoft }]}>Usa le credenziali del tuo account FitCoach Pro.</Text>

        <View style={[styles.inputShell, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
          <Mail size={18} color={colors.inkFaint} />
          <TextInput
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={identifier}
          onChangeText={setIdentifier}
            placeholderTextColor={colors.inkFaint}
            style={[styles.input, { color: colors.ink }]}
          />
        </View>
        <View style={[styles.inputShell, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
          <Lock size={18} color={colors.inkFaint} />
          <TextInput
            placeholder="Password"
            secureTextEntry={!passwordVisible}
            value={password}
            onChangeText={setPassword}
            placeholderTextColor={colors.inkFaint}
            style={[styles.input, { color: colors.ink }]}
          />
          <Pressable
            onPress={() => setPasswordVisible((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? 'Nascondi password' : 'Mostra password'}
            hitSlop={8}>
            {passwordVisible ? <EyeOff size={18} color={colors.inkSoft} /> : <Eye size={18} color={colors.inkSoft} />}
          </Pressable>
        </View>
        {error ? <Text style={[styles.error, { color: colors.rust }]}>{error}</Text> : null}
        <AppButton label={submitting ? 'Accesso...' : 'Accedi'} onPress={handleLogin} loading={submitting} fullWidth size="lg" />
        <Pressable onPress={() => router.push('/password-dimenticata' as Href)} hitSlop={6}>
          <Text style={[styles.forgotPassword, { color: colors.moss }]}>Password dimenticata?</Text>
        </Pressable>
        <View style={styles.registerLinks}>
          <Pressable onPress={() => router.push('/registrazione-coach' as Href)} hitSlop={6}>
            <Text style={[styles.registerLink, { color: colors.moss }]}>Registrati come coach</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/registrazione-cliente' as Href)} hitSlop={6}>
            <Text style={[styles.registerLink, { color: colors.moss }]}>Registrati come cliente</Text>
          </Pressable>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glowLayer: {
    ...StyleSheet.absoluteFill,
  },
  beam: {
    height: 260,
    opacity: 0.2,
    position: 'absolute',
    right: -60,
    top: -70,
    transform: [{ rotate: '38deg' }],
    width: 86,
  },
  beamSoft: {
    height: 190,
    opacity: 0.14,
    position: 'absolute',
    right: 32,
    top: 54,
    transform: [{ rotate: '38deg' }],
    width: 34,
  },
  titleBlock: {
    gap: AppSpacing[2],
    marginBottom: AppSpacing[5],
  },
  subtitle: {
    fontSize: AppFontSize.base,
    fontWeight: '600',
  },
  form: {
    borderRadius: 28,
    borderWidth: 1,
    gap: AppSpacing[3],
    padding: AppSpacing[5],
  },
  formTitle: {
    fontSize: 28,
    fontWeight: '900',
  },
  formSubtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginTop: -AppSpacing[2],
  },
  inputShell: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: AppSpacing[2],
    minHeight: 54,
    paddingHorizontal: AppSpacing[4],
  },
  input: {
    flex: 1,
    fontSize: AppFontSize.md,
    fontWeight: '600',
    minWidth: 0,
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
