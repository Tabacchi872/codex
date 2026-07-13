import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppScreen, AppTextField } from '@/components/ui';
import { completePasswordChange, signOut } from '@/lib/auth-service';
import { useAuthStore } from '@/store/auth-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

// Cambio password obbligatorio per un utente Supabase reale (coach o
// cliente) a cui e' stata inviata una password provvisoria via la Edge
// Function send-temporary-credentials. Analogo a ChangePasswordScreen, ma
// quest'ultimo opera solo sull'account demo locale (ClientAccount in
// client-store.ts); qui la password cambia davvero su Supabase Auth
// (completePasswordChange in auth-service.ts) e must_change_password viene
// azzerato sulla riga profiles corrispondente, non su uno store locale.
export function SupabaseChangePasswordScreen() {
  const { colors } = useAppTheme();
  const setMustChangePasswordSupabase = useAuthStore((s) => s.setMustChangePasswordSupabase);
  const logout = useAuthStore((s) => s.logout);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (newPassword.length < 6) {
      setError('La nuova password deve avere almeno 6 caratteri.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Le due password non coincidono.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await completePasswordChange(newPassword);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMustChangePasswordSupabase(false);
  }

  async function handleLogout() {
    await signOut();
    logout();
  }

  return (
    <AppScreen contentStyle={styles.content} bottomTabInset={false}>
      <View style={styles.titleBlock}>
        <Text style={[styles.title, { color: colors.ink }]}>Cambia password</Text>
        <Text style={[styles.subtitle, { color: colors.inkSoft }]}>
          Ti e' stata inviata una password provvisoria. Impostane una nuova per continuare.
        </Text>
      </View>

      <AppCard style={styles.form}>
        <AppTextField
          label="Nuova password"
          placeholder="Nuova password"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
        />
        <AppTextField
          label="Conferma nuova password"
          placeholder="Conferma nuova password"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        {error ? <Text style={[styles.error, { color: colors.rust }]}>{error}</Text> : null}
        <AppButton
          label={submitting ? 'Salvataggio...' : 'Salva nuova password'}
          onPress={handleSubmit}
          loading={submitting}
          fullWidth
          size="lg"
        />
      </AppCard>

      <Pressable onPress={handleLogout} hitSlop={6}>
        <Text style={[styles.logoutLink, { color: colors.inkSoft }]}>Esci</Text>
      </Pressable>
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
    marginBottom: AppSpacing[5],
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: AppFontSize.base,
    fontWeight: '500',
  },
  form: {
    gap: AppSpacing[3],
  },
  error: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  logoutLink: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: AppSpacing[3],
  },
});
