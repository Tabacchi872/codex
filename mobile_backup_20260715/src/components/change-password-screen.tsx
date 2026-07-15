import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from './card';
import { ScreenBackground } from './screen-background';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/lib/auth-service';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import type { ClientAccount } from '@/types/client';

// Cambio password obbligatorio al primo accesso. La "nuova password" sostituisce
// temporaryPassword in chiaro nello store locale (nessun hashing, nessun
// backend) — dettagli tecnici in docs/DECISIONS.md, non in questa schermata.
export function ChangePasswordScreen({ account }: { account: ClientAccount }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const updateAccount = useClientStore((s) => s.updateAccount);
  const logout = useAuthStore((s) => s.logout);

  async function handleLogout() {
    await signOut();
    logout();
  }
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (newPassword.length < 6) {
      setError('La nuova password deve avere almeno 6 caratteri.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Le due password non coincidono.');
      return;
    }
    setError(null);
    updateAccount({ ...account, temporaryPassword: newPassword, mustChangePassword: false });
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
          Cambia password
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Al primo accesso devi impostare una nuova password.
        </ThemedText>
      </View>

      <Card style={styles.form}>
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
        <Pressable onPress={handleSubmit}>
          <View style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" themeColor="onPrimary">
              Salva nuova password
            </ThemedText>
          </View>
        </Pressable>
      </Card>

      <Pressable onPress={handleLogout}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.logoutLink}>
          Esci
        </ThemedText>
      </Pressable>
    </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    flexGrow: 1,
  },
  titleBlock: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  form: {
    gap: Spacing.two,
  },
  primaryButton: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  logoutLink: {
    textAlign: 'center',
  },
});
