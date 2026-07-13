import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppTextField } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { FeaturesEditor, SegmentedChoice } from '@/components/subscription-package-form-fields';
import { createPackage } from '@/lib/subscription-packages-service';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import type { SubscriptionPackageDurationUnit, SubscriptionPackageTargetRole } from '@/types/subscription-packages';

export default function SuperadminNewPackage() {
  const params = useLocalSearchParams<{ role?: string | string[] }>();
  const rawRole = Array.isArray(params.role) ? params.role[0] : params.role;
  const targetRole: SubscriptionPackageTargetRole = rawRole === 'client' ? 'client' : 'coach';
  const { colors } = useAppTheme();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [durationValue, setDurationValue] = useState('1');
  const [durationUnit, setDurationUnit] = useState<SubscriptionPackageDurationUnit>('months');
  const [maxClients, setMaxClients] = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState('0');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const parsedPrice = Number(price.replace(',', '.'));
    const parsedDuration = Number(durationValue);
    const parsedSortOrder = Number(sortOrder) || 0;
    const parsedMaxClients = maxClients.trim() === '' ? null : Number(maxClients);

    if (!name.trim()) {
      setError('Il nome del pacchetto e\' obbligatorio.');
      return;
    }
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Il prezzo deve essere un numero valido.');
      return;
    }
    if (Number.isNaN(parsedDuration) || parsedDuration <= 0) {
      setError('La durata deve essere un numero maggiore di zero.');
      return;
    }
    if (targetRole === 'coach' && maxClients.trim() !== '' && (Number.isNaN(parsedMaxClients) || (parsedMaxClients ?? 0) < 0)) {
      setError('Il limite clienti deve essere un numero valido o vuoto per illimitato.');
      return;
    }

    setSaving(true);
    setError('');
    const result = await createPackage({
      targetRole,
      name,
      description,
      price: parsedPrice,
      currency: currency.trim() || 'EUR',
      durationValue: parsedDuration,
      durationUnit,
      maxClients: targetRole === 'coach' ? parsedMaxClients : null,
      features,
      isActive: true,
      sortOrder: parsedSortOrder,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace('/superadmin/pacchetti' as Href);
  }

  return (
    <SuperadminShell
      title={targetRole === 'coach' ? 'Nuovo pacchetto coach' : 'Nuovo pacchetto cliente'}
      description="I dati inseriti qui sono quelli letti dall'app: nessun prezzo/contenuto e' hardcodato altrove.">
      <AppCard style={styles.card}>
        <AppTextField label="Nome pacchetto" value={name} onChangeText={setName} placeholder="Es. Pro" />
        <AppTextField
          label="Descrizione"
          value={description}
          onChangeText={setDescription}
          placeholder="Cosa include questo pacchetto"
          multiline
        />

        <View style={styles.row}>
          <View style={styles.half}>
            <AppTextField label="Prezzo" value={price} onChangeText={setPrice} placeholder="49.90" keyboardType="decimal-pad" />
          </View>
          <View style={styles.third}>
            <AppTextField label="Valuta" value={currency} onChangeText={setCurrency} placeholder="EUR" autoCapitalize="characters" />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.third}>
            <AppTextField
              label="Durata"
              value={durationValue}
              onChangeText={setDurationValue}
              placeholder="1"
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.half}>
            <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Unita&apos; durata</Text>
            <SegmentedChoice
              options={[
                { value: 'days', label: 'Giorni' },
                { value: 'months', label: 'Mesi' },
              ]}
              value={durationUnit}
              onChange={(value) => setDurationUnit(value as SubscriptionPackageDurationUnit)}
            />
          </View>
        </View>

        {targetRole === 'coach' ? (
          <AppTextField
            label="Limite clienti"
            value={maxClients}
            onChangeText={setMaxClients}
            placeholder="Vuoto = illimitato"
            keyboardType="number-pad"
          />
        ) : null}

        <AppTextField label="Ordine di visualizzazione" value={sortOrder} onChangeText={setSortOrder} placeholder="0" keyboardType="number-pad" />

        <FeaturesEditor features={features} onChange={setFeatures} />

        {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}

        <AppButton label="Crea pacchetto" onPress={handleSave} loading={saving} fullWidth />
      </AppCard>
    </SuperadminShell>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[3],
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  half: {
    flexBasis: 140,
    flexGrow: 1,
  },
  third: {
    flexBasis: 100,
    flexGrow: 1,
  },
  fieldLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginBottom: 6,
  },
  errorText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
});
