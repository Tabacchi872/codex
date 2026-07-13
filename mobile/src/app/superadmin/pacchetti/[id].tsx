import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppTextField } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { FeaturesEditor, SegmentedChoice } from '@/components/subscription-package-form-fields';
import { deletePackage, getPackageById, updatePackage } from '@/lib/subscription-packages-service';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import type { SubscriptionPackage, SubscriptionPackageDurationUnit } from '@/types/subscription-packages';

export default function SuperadminPackageDetail() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const packageId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { colors } = useAppTheme();

  const [pkg, setPkg] = useState<SubscriptionPackage | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [durationValue, setDurationValue] = useState('1');
  const [durationUnit, setDurationUnit] = useState<SubscriptionPackageDurationUnit>('months');
  const [maxClients, setMaxClients] = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!packageId) {
      setPkg(null);
      return;
    }
    let active = true;
    (async () => {
      const result = await getPackageById(packageId);
      if (!active) return;
      if (!result.ok) {
        setError(result.message);
        setPkg(null);
        return;
      }
      setPkg(result.data);
      if (result.data) {
        setName(result.data.name);
        setDescription(result.data.description ?? '');
        setPrice(String(result.data.price));
        setCurrency(result.data.currency);
        setDurationValue(String(result.data.durationValue));
        setDurationUnit(result.data.durationUnit);
        setMaxClients(result.data.maxClients === null ? '' : String(result.data.maxClients));
        setFeatures(result.data.features);
        setSortOrder(String(result.data.sortOrder));
        setIsActive(result.data.isActive);
      }
    })();
    return () => {
      active = false;
    };
  }, [packageId]);

  if (pkg === undefined) {
    return (
      <SuperadminShell title="Pacchetto">
        <AppCard>
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Caricamento...</Text>
        </AppCard>
      </SuperadminShell>
    );
  }

  if (!pkg) {
    return (
      <SuperadminShell title="Pacchetto non trovato">
        <AppCard style={styles.card}>
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>{error || 'Il pacchetto richiesto non e\' disponibile.'}</Text>
          <AppButton label="Torna ai pacchetti" onPress={() => router.replace('/superadmin/pacchetti' as Href)} fullWidth />
        </AppCard>
      </SuperadminShell>
    );
  }

  async function handleSave() {
    if (!pkg) return;
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
    if (pkg.targetRole === 'coach' && maxClients.trim() !== '' && (Number.isNaN(parsedMaxClients) || (parsedMaxClients ?? 0) < 0)) {
      setError('Il limite clienti deve essere un numero valido o vuoto per illimitato.');
      return;
    }

    setSaving(true);
    setError('');
    const result = await updatePackage(pkg.id, {
      targetRole: pkg.targetRole,
      name,
      description,
      price: parsedPrice,
      currency: currency.trim() || 'EUR',
      durationValue: parsedDuration,
      durationUnit,
      maxClients: pkg.targetRole === 'coach' ? parsedMaxClients : null,
      features,
      isActive,
      sortOrder: parsedSortOrder,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPkg(result.data);
  }

  async function handleDelete() {
    if (!pkg) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    setDeleteError('');
    const result = await deletePackage(pkg.id);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.message);
      setConfirmingDelete(false);
      return;
    }
    router.replace('/superadmin/pacchetti' as Href);
  }

  return (
    <SuperadminShell title={pkg.name} description={pkg.targetRole === 'coach' ? 'Pacchetto coach' : 'Pacchetto cliente'}>
      <AppCard style={styles.card}>
        <AppTextField label="Nome pacchetto" value={name} onChangeText={setName} />
        <AppTextField label="Descrizione" value={description} onChangeText={setDescription} multiline />

        <View style={styles.row}>
          <View style={styles.half}>
            <AppTextField label="Prezzo" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
          </View>
          <View style={styles.third}>
            <AppTextField label="Valuta" value={currency} onChangeText={setCurrency} autoCapitalize="characters" />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.third}>
            <AppTextField label="Durata" value={durationValue} onChangeText={setDurationValue} keyboardType="number-pad" />
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

        {pkg.targetRole === 'coach' ? (
          <AppTextField label="Limite clienti" value={maxClients} onChangeText={setMaxClients} placeholder="Vuoto = illimitato" keyboardType="number-pad" />
        ) : null}

        <AppTextField label="Ordine di visualizzazione" value={sortOrder} onChangeText={setSortOrder} keyboardType="number-pad" />

        <FeaturesEditor features={features} onChange={setFeatures} />

        <SegmentedChoice
          options={[
            { value: 'active', label: 'Attivo' },
            { value: 'inactive', label: 'Non attivo' },
          ]}
          value={isActive ? 'active' : 'inactive'}
          onChange={(value) => setIsActive(value === 'active')}
        />

        {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}

        <AppButton label="Salva pacchetto" onPress={handleSave} loading={saving} fullWidth />
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={[styles.dangerTitle, { color: colors.ink }]}>Elimina pacchetto</Text>
        <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
          Consentito solo se nessun abbonamento attivo/in attesa e' collegato a questo pacchetto. In alternativa, disattivalo sopra.
        </Text>
        {deleteError ? <Text style={[styles.errorText, { color: colors.rust }]}>{deleteError}</Text> : null}
        <AppButton
          label={confirmingDelete ? 'Conferma eliminazione' : 'Elimina pacchetto'}
          onPress={handleDelete}
          variant={confirmingDelete ? 'primary' : 'outline'}
          loading={deleting}
          fullWidth
        />
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
  dangerTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
});
