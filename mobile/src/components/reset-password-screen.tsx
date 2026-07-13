import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from './card';
import { ScreenBackground } from './screen-background';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCurrentSession, signOut, updatePassword } from '@/lib/auth-service';
import { supabase, supabaseConfig } from '@/lib/supabase';

type Status = 'checking' | 'ready' | 'invalid' | 'success';

// Raggiunta solo cliccando il link Supabase (resetPasswordForEmail). Su web,
// detectSessionInUrl (lib/supabase.ts) legge il frammento #access_token=...
// dell'URL e stabilisce una sessione di recovery prima che questo componente
// monti; qui si aspetta solo che compaia (getSession + evento
// PASSWORD_RECOVERY), senza rifare login manuale.
export function ResetPasswordScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token_hash?: string; type?: string }>();
  const [status, setStatus] = useState<Status>('checking');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Il link email di Supabase puo' arrivare in due formati diversi, a
  // seconda di come e' scritto il template "Reset password" sul progetto:
  // (1) {{ .ConfirmationURL }} -> passa da /auth/v1/verify, che reindirizza
  // qui con #access_token=...&type=recovery nel FRAMMENTO — gestito in modo
  // automatico da detectSessionInUrl (lib/supabase.ts) prima ancora che
  // questo componente monti, quindi basta aspettare che la sessione compaia
  // (sotto). (2) {{ .TokenHash }} (pattern piu' recente consigliato da
  // Supabase per redirect diretti nell'app, senza passare dal dominio
  // Supabase) -> arriva qui con ?token_hash=...&type=recovery nella QUERY
  // STRING — questo formato NON viene MAI gestito automaticamente dal
  // client: senza una chiamata esplicita a verifyOtp nessuna sessione si
  // stabilisce mai, e prima di questo fix l'utente restava bloccato senza
  // capire perche'. Vedi docs/EMAIL_SETUP.md.
  const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : undefined;
  const recoveryType = typeof params.type === 'string' ? params.type : undefined;

  useEffect(() => {
    if (!supabaseConfig.isConfigured || !supabase) {
      setStatus('invalid');
      return;
    }
    const client = supabase;

    let active = true;
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        setStatus('ready');
      }
    });

    async function establishSession() {
      if (tokenHash && recoveryType === 'recovery') {
        const { error: verifyError } = await client.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
        if (!active) return;
        if (!verifyError) {
          setStatus('ready');
          return;
        }
      }

      const result = await getCurrentSession();
      if (!active) return;
      if (result.ok && result.data) {
        setStatus('ready');
        return;
      }
      // Da' il tempo a detectSessionInUrl di elaborare il frammento dell'URL
      // (formato 1 sopra) prima di dichiarare il link non valido.
      setTimeout(() => {
        if (active) setStatus((current) => (current === 'checking' ? 'invalid' : current));
      }, 1500);
    }

    establishSession();

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [tokenHash, recoveryType]);

  async function handleSubmit() {
    if (newPassword.length < 6) {
      setError('La nuova password deve avere almeno 6 caratteri.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Le due password non coincidono.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await updatePassword(newPassword);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setStatus('success');
  }

  async function backToLogin() {
    await signOut();
    router.replace('/' as Href);
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
            Reimposta password
          </ThemedText>
        </View>

        <Card style={styles.form}>
          {status === 'checking' && (
            <ThemedText type="small" themeColor="textSecondary">
              Verifica del link in corso...
            </ThemedText>
          )}

          {status === 'invalid' && (
            <>
              <ThemedText type="small" themeColor="statusExpired">
                Link non valido o scaduto. Richiedi un nuovo link da &quot;Password dimenticata&quot;.
              </ThemedText>
              <Pressable onPress={() => router.replace('/password-dimenticata' as Href)} hitSlop={6}>
                <View style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
                  <ThemedText type="smallBold" themeColor="onPrimary">
                    Richiedi nuovo link
                  </ThemedText>
                </View>
              </Pressable>
            </>
          )}

          {status === 'ready' && (
            <>
              <ThemedTextInput placeholder="Nuova password" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
              <ThemedTextInput
                placeholder="Conferma nuova password"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              {error && (
                <ThemedText type="small" themeColor="statusExpired">
                  {error}
                </ThemedText>
              )}
              <Pressable onPress={handleSubmit} disabled={submitting} hitSlop={6}>
                <View style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: submitting ? 0.6 : 1 }]}>
                  <ThemedText type="smallBold" themeColor="onPrimary">
                    {submitting ? 'Salvataggio...' : 'Salva nuova password'}
                  </ThemedText>
                </View>
              </Pressable>
            </>
          )}

          {status === 'success' && (
            <>
              <ThemedText type="small" themeColor="statusActive">
                Password aggiornata. Ora puoi accedere con la nuova password.
              </ThemedText>
              <Pressable onPress={backToLogin} hitSlop={6}>
                <View style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
                  <ThemedText type="smallBold" themeColor="onPrimary">
                    Torna al login
                  </ThemedText>
                </View>
              </Pressable>
            </>
          )}
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
});
