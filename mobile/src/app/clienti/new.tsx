import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppScreen, AppTextField } from '@/components/ui';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { CLIENT_STATUS_LABEL, type Client, type ClientStatus } from '@/types/client';

const STATUS_OPTIONS: ClientStatus[] = ['attivo', 'in_pausa', 'scaduto'];

export default function NuovoClienteScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');
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
    return <CoachOnlyNotice />;
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
    <AppScreen>
      <AppCard style={styles.form}>
        <AppTextField label="Nome" value={firstName} onChangeText={setFirstName} placeholder="Es. Anna" />
        <AppTextField label="Cognome" value={lastName} onChangeText={setLastName} placeholder="Es. Rossi" />
        <AppTextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="anna.rossi@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <AppTextField label="Telefono (opzionale)" value={phone} onChangeText={setPhone} placeholder="+39 333 0000000" keyboardType="phone-pad" />
        <AppTextField
          label="Data di nascita (opzionale, AAAA-MM-GG)"
          value={birthDate}
          onChangeText={setBirthDate}
          placeholder="1990-05-20"
        />
        <AppTextField label="Obiettivo" value={goal} onChangeText={setGoal} placeholder="Es. Dimagrimento, forza, tonificazione" />
        <AppTextField label="Note interne" value={notes} onChangeText={setNotes} placeholder="Visibili solo a te" multiline />
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Stato cliente</Text>
          <View style={styles.chipsRow}>
            {STATUS_OPTIONS.map((option) => {
              const active = option === status;
              return (
                <Pressable
                  key={option}
                  onPress={() => setStatus(option)}
                  style={[styles.chip, { backgroundColor: active ? colors.moss : 'transparent', borderColor: colors.moss }]}>
                  <Text style={[styles.chipLabel, { color: active ? colors.onMoss : colors.moss }]}>
                    {CLIENT_STATUS_LABEL[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </AppCard>

      {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}

      <View style={styles.buttonsRow}>
        <View style={styles.cancelButtonWrap}>
          <AppButton label="Annulla" onPress={() => router.back()} variant="outline" fullWidth />
        </View>
        <View style={styles.saveButtonWrap}>
          <AppButton label="Salva cliente" onPress={handleSave} fullWidth />
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: AppSpacing[3],
  },
  field: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  chip: {
    borderRadius: AppRadius.pill,
    borderWidth: 1.5,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: 7,
  },
  chipLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  errorText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: AppSpacing[3],
  },
  cancelButtonWrap: {
    flex: 1,
  },
  saveButtonWrap: {
    flex: 1.4,
  },
});
