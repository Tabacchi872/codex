import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayMonth } from '@/lib/format-date';
import { useAuthStore } from '@/store/auth-store';
import { useCheckinStore } from '@/store/checkin-store';
import { PROGRAM_INTENSITY_LABEL, type ProgramIntensity, type WeeklyCheckin } from '@/types/checkin';

const INTENSITY_OPTIONS: ProgramIntensity[] = ['molto_intenso', 'medio_intenso', 'medio', 'troppo_facile'];

// Check-in settimanale: salvato SOLO localmente (nessun backend). Le foto sono
// URI locali presi dalla libreria del dispositivo (expo-image-picker): su web
// sono blob URL validi solo nella sessione corrente del browser — limite reale,
// dichiarato nel report tecnico, non nella UI.
export default function QuestionarioScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const checkins = useCheckinStore((s) => s.checkins);
  const addCheckin = useCheckinStore((s) => s.addCheckin);

  const [weight, setWeight] = useState('');
  const [frontPhoto, setFrontPhoto] = useState<string | null>(null);
  const [sidePhoto, setSidePhoto] = useState<string | null>(null);
  const [backPhoto, setBackPhoto] = useState<string | null>(null);
  const [issues, setIssues] = useState('');
  const [intensity, setIntensity] = useState<ProgramIntensity | null>(null);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const myLastCheckin = checkins
    .filter((c) => c.clientId === currentClientId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  async function pickPhoto(setter: (uri: string) => void) {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      setter(result.assets[0].uri);
    }
  }

  function handleSubmit() {
    if (!currentClientId) return;
    const checkin: WeeklyCheckin = {
      id: `checkin-${Date.now()}`,
      clientId: currentClientId,
      date: new Date().toISOString().slice(0, 10),
      weightToday: weight ? Number(weight.replace(',', '.')) : null,
      frontPhotoUri: frontPhoto,
      sidePhotoUri: sidePhoto,
      backPhotoUri: backPhoto,
      exerciseIssues: issues,
      intensity,
      notes,
      createdAt: new Date().toISOString(),
    };
    addCheckin(checkin);
    setSubmitted(true);
  }

  function handleReset() {
    setWeight('');
    setFrontPhoto(null);
    setSidePhoto(null);
    setBackPhoto(null);
    setIssues('');
    setIntensity(null);
    setNotes('');
    setSubmitted(false);
  }

  if (submitted) {
    return (
      <ScreenBackground>
        <View style={styles.confirmContainer}>
          <Card style={styles.confirmCard}>
            <ThemedText type="smallBold">Check-in inviato</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Il tuo coach potrà vederlo appena la sincronizzazione sarà disponibile. Per ora è salvato su questo
              dispositivo.
            </ThemedText>
            <Pressable onPress={() => router.back()}>
              <View style={[styles.submitButton, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" themeColor="onPrimary">
                  Torna alla Home
                </ThemedText>
              </View>
            </Pressable>
            <Pressable onPress={handleReset}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
                Compila un nuovo check-in
              </ThemedText>
            </Pressable>
          </Card>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three, paddingBottom: Spacing.six },
        ]}>
        <ThemedText type="title" style={styles.title}>
          Check-in settimanale
        </ThemedText>
        {myLastCheckin && (
          <ThemedText type="small" themeColor="textSecondary">
            Ultimo check-in inviato: {formatDayMonth(myLastCheckin.date)}
          </ThemedText>
        )}

        <FieldLabel>Peso di oggi (kg)</FieldLabel>
        <ThemedTextInput placeholder="Es. 78.5" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} />

        <FieldLabel>Foto progressi</FieldLabel>
        <View style={styles.photosRow}>
          <PhotoSlot label="Frontale" uri={frontPhoto} onPick={() => pickPhoto(setFrontPhoto)} />
          <PhotoSlot label="Laterale" uri={sidePhoto} onPick={() => pickPhoto(setSidePhoto)} />
          <PhotoSlot label="Di spalle" uri={backPhoto} onPick={() => pickPhoto(setBackPhoto)} />
        </View>

        <FieldLabel>Problemi con gli esercizi</FieldLabel>
        <ThemedTextInput
          placeholder="Es. fastidio alla spalla durante la panca"
          value={issues}
          onChangeText={setIssues}
          multiline
          style={styles.textarea}
        />

        <FieldLabel>Intensità del programma</FieldLabel>
        <View style={styles.intensityRow}>
          {INTENSITY_OPTIONS.map((option) => {
            const active = intensity === option;
            return (
              <Pressable key={option} onPress={() => setIntensity(option)}>
                <View
                  style={[
                    styles.intensityChip,
                    { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.softRed : theme.backgroundElement },
                  ]}>
                  <ThemedText type="small" themeColor={active ? 'primary' : 'textSecondary'}>
                    {PROGRAM_INTENSITY_LABEL[option]}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>

        <FieldLabel>Note libere</FieldLabel>
        <ThemedTextInput placeholder="Altro da segnalare al coach…" value={notes} onChangeText={setNotes} multiline style={styles.textarea} />

        <View style={styles.actionsRow}>
          <Pressable onPress={handleSubmit} style={styles.actionFlex}>
            <View style={[styles.submitButton, { backgroundColor: theme.primary }]}>
              <ThemedText type="smallBold" themeColor="onPrimary">
                Invia
              </ThemedText>
            </View>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.actionFlex}>
            <View style={[styles.cancelButton, { borderColor: theme.border }]}>
              <ThemedText type="smallBold">Annulla</ThemedText>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" style={styles.fieldLabel}>
      {children}
    </ThemedText>
  );
}

function PhotoSlot({ label, uri, onPick }: { label: string; uri: string | null; onPick: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPick} style={styles.photoSlot}>
      <View style={[styles.photoBox, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        {uri ? (
          <Image source={{ uri }} style={styles.photoImage} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            + Aggiungi
          </ThemedText>
        )}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  fieldLabel: {
    marginTop: Spacing.three,
  },
  photosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  photoSlot: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  photoBox: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  intensityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  intensityChip: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  actionFlex: {
    flex: 1,
  },
  submitButton: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  cancelButton: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  confirmContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  confirmCard: {
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  centerText: {
    textAlign: 'center',
  },
});
