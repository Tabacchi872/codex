import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppTextField } from './ui';

import { AppRadius, AppSpacing, useAppTheme } from '@/theme';

// Modal unico per "Crea cartella"/"Rinomina cartella": un solo campo nome,
// nessun altro dato — la libreria modelli non ha altri metadati di cartella.
export function TemplateFolderNameModal({
  visible,
  title,
  initialName,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  initialName: string;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const { colors } = useAppTheme();
  const [name, setName] = useState(initialName);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
          <AppTextField
            value={name}
            onChangeText={setName}
            placeholder="Es. Dimagrimento"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => name.trim() && onConfirm(name.trim())}
          />
          {error ? <Text style={[styles.error, { color: colors.rust }]}>{error}</Text> : null}
          <View style={styles.actions}>
            <View style={styles.actionItem}>
              <AppButton label="Annulla" onPress={onCancel} variant="outline" fullWidth disabled={saving} />
            </View>
            <View style={styles.actionItem}>
              <AppButton label="Salva" onPress={() => onConfirm(name.trim())} fullWidth disabled={!name.trim() || saving} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: AppSpacing[5],
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: AppRadius.xl,
    borderWidth: 1,
    padding: AppSpacing[4],
    gap: AppSpacing[3],
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  error: {
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  actionItem: {
    flex: 1,
    minWidth: 0,
  },
});
