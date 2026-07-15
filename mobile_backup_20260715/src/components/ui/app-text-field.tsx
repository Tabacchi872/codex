import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type AppTextFieldProps = TextInputProps & {
  label?: string;
  error?: string;
};

// Campo form unico del design system: label sopra (FieldLabel nel mockup),
// bordo line, radius 12, sfondo surfaceSubtle quando disabled (coerente con
// TextField disabled nel mockup: sand + testo faint). Errore in rust sotto il
// campo, stesso ruolo colore di AppBadge tone="rust"/AppErrorState.
//
// Tastiera (fix APK Android): returnKeyType di default "done" — ogni campo
// single-line mostra "Fine" e alla conferma chiude la tastiera (blur di
// default di TextInput), cosi' nessun form resta bloccato con la tastiera
// aperta. Override con returnKeyType="next" + onSubmitEditing per il
// chaining campo→campo (vedi registration-screens.tsx). forwardRef espone il
// TextInput nativo proprio per permettere quel chaining (.focus()).
export const AppTextField = forwardRef<TextInput, AppTextFieldProps>(function AppTextField(
  { label, error, style, editable, returnKeyType = 'done', ...props },
  ref,
) {
  const { colors } = useAppTheme();
  const disabled = editable === false;

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={[styles.label, { color: colors.inkSoft }]}>{label}</Text> : null}
      <TextInput
        {...props}
        ref={ref}
        editable={editable}
        returnKeyType={returnKeyType}
        placeholderTextColor={colors.inkFaint}
        style={[
          styles.input,
          {
            color: disabled ? colors.inkFaint : colors.ink,
            borderColor: error ? colors.rust : colors.border,
            backgroundColor: disabled ? colors.surfaceSubtle : colors.surface,
          },
          style,
        ]}
      />
      {error ? <Text style={[styles.error, { color: colors.rust }]}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
    width: '100%',
    minWidth: 0,
  },
  label: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  input: {
    width: '100%',
    minWidth: 0,
    minHeight: 46,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: AppRadius.md,
    paddingHorizontal: AppSpacing[4] - 2,
    fontSize: AppFontSize.md,
  },
  error: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
});
