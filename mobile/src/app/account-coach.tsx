import { LogOut, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { CoachInviteCodeCard } from '@/components/coach-invite-code-card';
import { DeveloperInfoSection } from '@/components/developer-info-section';
import { AppButton, AppCard, AppErrorState, AppScreen, AppSectionTitle, AppTextField, BackHeader, UserAvatar } from '@/components/ui';
import {
  deleteOwnAccount,
  getCurrentSession,
  loadOwnProfile,
  signOut,
  splitFullName,
  updateEmail,
  updateOwnProfile,
  updatePassword,
  type OwnProfileData,
} from '@/lib/auth-service';
import { pickClientAvatarImage, saveClientAvatarPresetRemote, uploadClientAvatar } from '@/lib/client-avatar-service';
import { useAuthStore } from '@/store/auth-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import type { ClientAvatarPreset } from '@/types/client';

const AVATAR_OPTIONS: { value: ClientAvatarPreset; label: string }[] = [
  { value: 'neutral', label: 'Neutro' },
  { value: 'female', label: 'Donna' },
  { value: 'male', label: 'Uomo' },
];

async function confirmAction(message: string) {
  if (Platform.OS === 'web') return globalThis.confirm(message);
  return new Promise<boolean>((resolve) => {
    Alert.alert('Conferma', message, [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Conferma', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    globalThis.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

// "Account coach" (hub Area coach): dati personali, cambio email/password da
// loggato, codice coach, eliminazione account, logout. Nessun dato demo:
// tutto viene letto/scritto su public.profiles tramite auth-service.ts
// (loadOwnProfile/updateOwnProfile/updateEmail/updatePassword), con l'id
// sempre preso dalla sessione corrente, mai passato dal chiamante.
export default function AccountCoachScreen() {
  const { colors } = useAppTheme();
  const logout = useAuthStore((s) => s.logout);

  const [profile, setProfile] = useState<OwnProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [editingProfile, setEditingProfile] = useState(false);
  const [firstNameDraft, setFirstNameDraft] = useState('');
  const [lastNameDraft, setLastNameDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);

  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmailDraft, setNewEmailDraft] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  const [changingPassword, setChangingPassword] = useState(false);
  const [newPasswordDraft, setNewPasswordDraft] = useState('');
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setProfileLoading(true);
    setProfileError(null);
    const result = await loadOwnProfile();
    setProfileLoading(false);
    if (!result.ok) {
      setProfileError(result.message);
      return;
    }
    setProfile(result.data);
    const { firstName, lastName } = splitFullName(result.data.fullName);
    setFirstNameDraft(firstName);
    setLastNameDraft(lastName);
    setPhoneDraft(result.data.phone);
  }

  function startEditingProfile() {
    if (!profile) return;
    const { firstName, lastName } = splitFullName(profile.fullName);
    setFirstNameDraft(firstName);
    setLastNameDraft(lastName);
    setPhoneDraft(profile.phone);
    setProfileMessage(null);
    setEditingProfile(true);
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    setProfileMessage(null);
    const fullName = [firstNameDraft.trim(), lastNameDraft.trim()].filter(Boolean).join(' ');
    const result = await updateOwnProfile({ fullName, phone: phoneDraft });
    setSavingProfile(false);
    if (!result.ok) {
      setProfileMessage(result.message);
      return;
    }
    setProfile((p) => (p ? { ...p, fullName, phone: phoneDraft.trim() } : p));
    setEditingProfile(false);
    setProfileMessage('Dati aggiornati.');
  }

  async function handlePickAvatar() {
    if (avatarUploading) return;
    const asset = await pickClientAvatarImage();
    if (!asset) return;
    const sessionResult = await getCurrentSession();
    const userId = sessionResult.ok ? sessionResult.data?.user.id : undefined;
    if (!userId) return;

    setAvatarUploading(true);
    setAvatarMessage(null);
    const uploaded = await uploadClientAvatar(userId, asset);
    setAvatarUploading(false);

    if (uploaded.ok) {
      setProfile((p) => (p ? { ...p, avatarUrl: uploaded.signedUrl ?? p.avatarUrl, avatarStoragePath: uploaded.path } : p));
      setAvatarMessage('Avatar aggiornato');
      return;
    }
    setAvatarMessage(uploaded.message);
  }

  async function handlePresetChange(preset: ClientAvatarPreset) {
    const sessionResult = await getCurrentSession();
    const userId = sessionResult.ok ? sessionResult.data?.user.id : undefined;
    if (!userId) return;
    setProfile((p) => (p ? { ...p, avatarPreset: preset } : p));
    const result = await saveClientAvatarPresetRemote(userId, preset);
    setAvatarMessage(result.ok ? 'Avatar aggiornato' : result.message);
  }

  async function handleChangeEmail() {
    const trimmed = newEmailDraft.trim();
    if (!trimmed) return;
    setEmailSaving(true);
    setEmailMessage(null);
    const result = await updateEmail(trimmed);
    setEmailSaving(false);
    if (!result.ok) {
      setEmailMessage(result.message);
      return;
    }
    setEmailMessage("Controlla la tua casella email (vecchio e/o nuovo indirizzo) per confermare il cambio.");
    setChangingEmail(false);
    setNewEmailDraft('');
  }

  async function handleChangePassword() {
    setPasswordError(null);
    if (newPasswordDraft.length < 8) {
      setPasswordError('La password deve avere almeno 8 caratteri.');
      return;
    }
    if (newPasswordDraft !== confirmPasswordDraft) {
      setPasswordError('Le due password non coincidono.');
      return;
    }
    setPasswordSaving(true);
    setPasswordMessage(null);
    const result = await updatePassword(newPasswordDraft);
    setPasswordSaving(false);
    if (!result.ok) {
      setPasswordError(result.message);
      return;
    }
    setPasswordMessage('Password aggiornata.');
    setChangingPassword(false);
    setNewPasswordDraft('');
    setConfirmPasswordDraft('');
  }

  async function handleLogout() {
    await signOut();
    logout();
  }

  async function handleDeleteAccount() {
    if (deletingAccount) return;
    const firstConfirm = await confirmAction(
      'Eliminare definitivamente il tuo account? Verranno cancellati tutti i tuoi dati (profilo, schede, appuntamenti, storico) in modo permanente.',
    );
    if (!firstConfirm) return;
    const secondConfirm = await confirmAction("Questa azione non puo' essere annullata. Confermi di voler eliminare il tuo account?");
    if (!secondConfirm) return;

    setDeletingAccount(true);
    const result = await deleteOwnAccount();
    setDeletingAccount(false);

    if (!result.ok) {
      notify('Eliminazione non riuscita', result.message);
      return;
    }

    // L'eliminazione server e' confermata (vedi deleteOwnAccount, anche
    // idempotente): da qui in poi nessun errore di logout/pulizia locale puo'
    // piu' trasformare questo successo in un fallimento mostrato all'utente —
    // solo log diagnostico, mai un Alert d'errore. logout() e' cio' che
    // riporta al login (AuthGate mostra LoginScreen appena isAuthenticated
    // diventa false), quindi va eseguito comunque anche se signOut() fallisce.
    try {
      await signOut();
    } catch (err) {
      if (__DEV__) console.warn('DELETE_ACCOUNT_SIGNOUT_ERROR', err instanceof Error ? err.message : String(err));
    }
    notify('Account eliminato', 'Il tuo account è stato eliminato correttamente.');
    try {
      logout();
    } catch (err) {
      if (__DEV__) console.warn('DELETE_ACCOUNT_LOCAL_CLEANUP_ERROR', err instanceof Error ? err.message : String(err));
    }
  }

  if (profileLoading) {
    return (
      <AppScreen>
        <BackHeader title="Account coach" fallbackHref="/area-coach" />
        <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Caricamento profilo...</Text>
      </AppScreen>
    );
  }

  if (profileError || !profile) {
    return (
      <AppScreen>
        <BackHeader title="Account coach" fallbackHref="/area-coach" />
        <AppCard>
          <AppErrorState message={profileError ?? 'Profilo non disponibile.'} onRetry={loadProfile} />
        </AppCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <BackHeader title="Account coach" fallbackHref="/area-coach" />

      <AppSectionTitle>DATI PERSONALI</AppSectionTitle>
      <AppCard style={styles.card}>
        <View style={styles.profileHeader}>
          <Pressable onPress={handlePickAvatar} accessibilityRole="button" accessibilityLabel="Aggiorna foto profilo" disabled={avatarUploading}>
            <UserAvatar
              firstName={splitFullName(profile.fullName).firstName}
              lastName={splitFullName(profile.fullName).lastName}
              imageUrl={profile.avatarUrl}
              preset={profile.avatarPreset}
              size={82}
              editable
            />
          </Pressable>
          <View style={styles.profileText}>
            <Text style={[styles.name, { color: colors.ink }]}>{profile.fullName || 'Nome non impostato'}</Text>
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>{profile.email}</Text>
            {avatarUploading ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>Caricamento foto...</Text> : null}
          </View>
        </View>

        <View style={styles.avatarOptions}>
          {AVATAR_OPTIONS.map((option) => {
            const active = (profile.avatarPreset ?? 'neutral') === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => handlePresetChange(option.value)}
                style={[styles.avatarChip, { borderColor: colors.moss, backgroundColor: active ? colors.moss : 'transparent' }]}>
                <Text style={[styles.avatarChipLabel, { color: active ? colors.onMoss : colors.moss }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {avatarMessage ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{avatarMessage}</Text> : null}

        {editingProfile ? (
          <View style={styles.editForm}>
            <AppTextField label="Nome" value={firstNameDraft} onChangeText={setFirstNameDraft} />
            <AppTextField label="Cognome" value={lastNameDraft} onChangeText={setLastNameDraft} />
            <AppTextField label="Telefono" value={phoneDraft} onChangeText={setPhoneDraft} keyboardType="phone-pad" />
            {profileMessage ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{profileMessage}</Text> : null}
            <View style={styles.formActions}>
              <AppButton label="Annulla" onPress={() => setEditingProfile(false)} variant="outline" size="sm" />
              <AppButton label="Salva" onPress={handleSaveProfile} loading={savingProfile} size="sm" />
            </View>
          </View>
        ) : (
          <>
            {profile.phone ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{profile.phone}</Text> : null}
            {profileMessage ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{profileMessage}</Text> : null}
            <AppButton label="Modifica" onPress={startEditingProfile} variant="outline" size="sm" />
          </>
        )}
      </AppCard>

      <AppSectionTitle>ACCOUNT</AppSectionTitle>
      <AppCard style={styles.card}>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Email attuale</Text>
        <Text style={[styles.name, { color: colors.ink }]}>{profile.email}</Text>

        {changingEmail ? (
          <View style={styles.editForm}>
            <AppTextField
              label="Nuovo indirizzo email"
              value={newEmailDraft}
              onChangeText={setNewEmailDraft}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {emailMessage ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{emailMessage}</Text> : null}
            <View style={styles.formActions}>
              <AppButton label="Annulla" onPress={() => setChangingEmail(false)} variant="outline" size="sm" />
              <AppButton label="Conferma" onPress={handleChangeEmail} loading={emailSaving} size="sm" />
            </View>
          </View>
        ) : (
          <>
            {emailMessage ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{emailMessage}</Text> : null}
            <AppButton label="Cambia email" onPress={() => setChangingEmail(true)} variant="outline" size="sm" />
          </>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {changingPassword ? (
          <View style={styles.editForm}>
            <AppTextField label="Nuova password" value={newPasswordDraft} onChangeText={setNewPasswordDraft} secureTextEntry />
            <AppTextField label="Conferma password" value={confirmPasswordDraft} onChangeText={setConfirmPasswordDraft} secureTextEntry />
            {passwordError ? <Text style={[styles.smallText, { color: colors.rust }]}>{passwordError}</Text> : null}
            {passwordMessage ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{passwordMessage}</Text> : null}
            <View style={styles.formActions}>
              <AppButton label="Annulla" onPress={() => setChangingPassword(false)} variant="outline" size="sm" />
              <AppButton label="Conferma" onPress={handleChangePassword} loading={passwordSaving} size="sm" />
            </View>
          </View>
        ) : (
          <>
            {passwordMessage ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{passwordMessage}</Text> : null}
            <AppButton label="Cambia password" onPress={() => setChangingPassword(true)} variant="outline" size="sm" />
          </>
        )}
      </AppCard>

      <AppSectionTitle>CODICE COACH</AppSectionTitle>
      <CoachInviteCodeCard
        title="Il tuo codice coach"
        description="I clienti possono usare questo codice per collegarsi al tuo profilo."
        showShare
      />

      <AppSectionTitle>SVILUPPATORE</AppSectionTitle>
      <DeveloperInfoSection />

      <Pressable onPress={handleLogout} hitSlop={8} style={styles.logout}>
        <LogOut size={15} color={colors.rust} />
        <Text style={[styles.logoutText, { color: colors.rust }]}>Esci</Text>
      </Pressable>

      <AppSectionTitle>ZONA PERICOLOSA</AppSectionTitle>
      <Pressable
        onPress={handleDeleteAccount}
        disabled={deletingAccount}
        hitSlop={8}
        style={[styles.logout, deletingAccount && styles.deleteButtonDisabled]}>
        <Trash2 size={15} color={colors.rust} />
        <Text style={[styles.logoutText, { color: colors.rust }]}>{deletingAccount ? 'Eliminazione in corso...' : 'Elimina account'}</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[2],
  },
  profileHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[3],
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  avatarOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  avatarChip: {
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: 7,
  },
  avatarChipLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  editForm: {
    gap: AppSpacing[2],
  },
  formActions: {
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'flex-end',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: AppSpacing[1],
  },
  logout: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: AppSpacing[2],
    minHeight: 44,
  },
  logoutText: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
});
