import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { CLIENT_STATUS_LABEL, type Client, type ClientStatus } from '@/types/client';

const STATUS_OPTIONS: ClientStatus[] = ['attivo', 'in_pausa', 'scaduto'];

export default function NuovoClienteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const isCoach = useAuthStore((s) => s.currentRole !== 'client');
  const addClient = useClientStore((s) => s.addClient);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [goal, setGoal] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ClientStatus>('attivo');
  const [error, setError] = useState<string | null>(null);

  if (!isCoach) {
    return (
      <ScreenBackground>
        <CoachOnlyNotice />
      </ScreenBackground>
    );
  }

  function handleSave() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Nome, cognome ed email sono obbligatori.');
      return;
    }
    setError(null);
    const client: Client = {
      id: `client-${Date.now()}`,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      birthDate: birthDate.trim() || undefined,
      goal: goal.trim(),
      notes: notes.trim(),
      status,
      createdAt: new Date().toISOString(),
    };
    addClient(client);
    router.replace(`/clienti/${client.id}`);
  }

  return (
    <ScreenBackground>
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three, paddingBottom: Spacing.six },
      ]}>
      <Card style={styles.form}>
        <Field label="Nome">
          <ThemedTextInput value={firstName} onChangeText={setFirstName} placeholder="Es. Anna" />
        </Field>
        <Field label="Cognome">
          <ThemedTextInput value={lastName} onChangeText={setLastName} placeholder="Es. Rossi" />
        </Field>
        <Field label="Email">
          <ThemedTextInput value={email} onChangeText={setEmail} placeholder="anna.rossi@email.com" autoCapitalize="none" keyboardType="email-address" />
        </Field>
        <Field label="Telefono (opzionale)">
          <ThemedTextInput value={phone} onChangeText={setPhone} placeholder="+39 333 0000000" keyboardType="phone-pad" />
        </Field>
        <Field label="Data di nascita (opzionale, AAAA-MM-GG)">
          <ThemedTextInput value={birthDate} onChangeText={setBirthDate} placeholder="1990-05-20" />
        </Field>
        <Field label="Obiettivo">
          <ThemedTextInput value={goal} onChangeText={setGoal} placeholder="Es. Dimagrimento, forza, tonificazione" />
        </Field>
        <Field label="Note interne">
          <ThemedTextInput value={notes} onChangeText={setNotes} placeholder="Visibili solo a te" multiline />
        </Field>
        <Field label="Stato cliente">
          <View style={styles.chipsRow}>
            {STATUS_OPTIONS.map((option) => {
              const active = option === status;
              return (
                <Pressable key={option} onPress={() => setStatus(option)}>
                  <View
                    style={[
                      styles.chip,
                      { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border },
                    ]}>
                    <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                      {CLIENT_STATUS_LABEL[option]}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Field>
      </Card>

      {error && (
        <ThemedText type="small" themeColor="statusExpired">
          {error}
        </ThemedText>
      )}

      <View style={styles.buttonsRow}>
        <Pressable onPress={() => router.back()} style={styles.cancelButtonWrap}>
          <View style={[styles.cancelButton, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">Annulla</ThemedText>
          </View>
        </Pressable>
        <Pressable onPress={handleSave} style={styles.saveButtonWrap}>
          <View style={[styles.saveButton, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" themeColor="onPrimary">
              Salva cliente
            </ThemedText>
          </View>
        </Pressable>
      </View>
    </ScrollView>
    </ScreenBackground>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  form: {
    gap: Spacing.three,
  },
  field: {
    gap: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  cancelButtonWrap: {
    flex: 1,
  },
  saveButtonWrap: {
    flex: 1.4,
  },
  cancelButton: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  saveButton: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
