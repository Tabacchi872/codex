import { FolderOpen } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from './ui';

import { flattenFolderTree } from '@/lib/template-folder-tree';
import { AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { TemplateFolder } from '@/types/template-library';

// Selettore cartella di destinazione per "Sposta in altra cartella" (modelli)
// e per scegliere la cartella alla creazione di un nuovo modello. Sempre
// un'unica lista piatta con indentazione per profondita' — nessuna necessita'
// di navigare l'albero un livello alla volta per questa scelta puntuale.
export function TemplateFolderPickerModal({
  visible,
  folders,
  selectedFolderId,
  onCancel,
  onSelect,
}: {
  visible: boolean;
  folders: TemplateFolder[];
  selectedFolderId: string | null;
  onCancel: () => void;
  onSelect: (folderId: string | null) => void;
}) {
  const { colors } = useAppTheme();
  const nodes = flattenFolderTree(folders);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.ink }]}>Scegli cartella</Text>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            <FolderOption
              label="Senza categoria"
              depth={0}
              active={selectedFolderId === null}
              onPress={() => onSelect(null)}
            />
            {nodes.map(({ folder, depth }) => (
              <FolderOption
                key={folder.id}
                label={folder.name}
                depth={depth + 1}
                active={selectedFolderId === folder.id}
                onPress={() => onSelect(folder.id)}
              />
            ))}
          </ScrollView>
          <AppButton label="Chiudi" onPress={onCancel} variant="outline" fullWidth />
        </View>
      </View>
    </Modal>
  );
}

function FolderOption({ label, depth, active, onPress }: { label: string; depth: number; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Scegli cartella ${label}`}
      style={[
        styles.option,
        { paddingLeft: AppSpacing[3] + depth * AppSpacing[4], backgroundColor: active ? colors.mossSoft : 'transparent' },
      ]}>
      <FolderOpen size={16} color={active ? colors.moss : colors.inkFaint} />
      <Text style={[styles.optionLabel, { color: active ? colors.moss : colors.ink, fontWeight: active ? '700' : '500' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
    maxHeight: '75%',
    borderRadius: AppRadius.xl,
    borderWidth: 1,
    padding: AppSpacing[4],
    gap: AppSpacing[3],
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  list: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing[2],
    minHeight: 44,
    paddingRight: AppSpacing[3],
    borderRadius: AppRadius.md,
  },
  optionLabel: {
    fontSize: 15,
    flexShrink: 1,
  },
});
