import { Modal, StyleSheet, Text, View } from 'react-native';

import { AppButton } from './ui';

import { AppRadius, AppSpacing, useAppTheme } from '@/theme';

// Mostrata SOLO quando la cartella contiene qualcosa (sottocartelle e/o
// modelli): il coach deve scegliere esplicitamente tra spostare il contenuto
// in "Senza categoria" o eliminarlo insieme alla cartella — mai una
// cancellazione automatica silenziosa del contenuto (CLAUDE.md regola 2,
// e requisito esplicito "Non cancellare automaticamente le schede").
export function TemplateFolderDeleteModal({
  visible,
  folderName,
  subfolderCount,
  templateCount,
  deleting,
  error,
  onCancel,
  onMoveToRoot,
  onDeleteAll,
}: {
  visible: boolean;
  folderName: string;
  subfolderCount: number;
  templateCount: number;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onMoveToRoot: () => void;
  onDeleteAll: () => void;
}) {
  const { colors } = useAppTheme();
  const parts: string[] = [];
  if (subfolderCount > 0) parts.push(`${subfolderCount} sottocartella${subfolderCount === 1 ? '' : 'e'}`);
  if (templateCount > 0) parts.push(`${templateCount} scheda${templateCount === 1 ? '' : 'e'} modello`);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.ink }]}>Elimina "{folderName}"</Text>
          <Text style={[styles.body, { color: colors.inkSoft }]}>
            In totale, questa cartella contiene {parts.join(' e ')} (incluse le sottocartelle). Cosa vuoi fare?
          </Text>
          {error ? <Text style={[styles.error, { color: colors.rust }]}>{error}</Text> : null}
          <View style={styles.actions}>
            <AppButton
              label="Sposta il contenuto diretto in Senza categoria, poi elimina questa cartella"
              onPress={onMoveToRoot}
              variant="outline"
              fullWidth
              disabled={deleting}
            />
            {subfolderCount > 0 ? (
              <Text style={[styles.hint, { color: colors.inkFaint }]}>
                Le sottocartelle dirette diventano di primo livello: il loro contenuto resta invariato, non viene spostato in Senza categoria.
              </Text>
            ) : null}
            <AppButton
              label="Elimina la cartella e tutto il contenuto"
              onPress={onDeleteAll}
              variant="outline"
              fullWidth
              disabled={deleting}
            />
            <AppButton label="Annulla" onPress={onCancel} variant="ghost" fullWidth disabled={deleting} />
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
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  error: {
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  actions: {
    gap: AppSpacing[2],
  },
});
