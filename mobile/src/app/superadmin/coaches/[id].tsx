import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, AppTextField, type AppBadgeTone } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { useSuperadminCoaches } from '@/hooks/use-superadmin-coaches';
import {
  assignCoachPackage,
  cancelCoachSubscription,
  regenerateCoachRegistrationCode,
  setCoachBillingStatus,
  setCoachRegistrationCodeActive,
  updateCoachProfile,
} from '@/lib/superadmin-coach-admin-service';
import { getBillingStatusLabel, isAppBillingStatus } from '@/lib/superadmin-billing-status';
import { listActivePackages } from '@/lib/subscription-packages-service';
import { useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';
import type { AppBillingStatus, AppPlanCode, CoachBillingProfile, CoachBillingSubjectType, DemoCoachClient } from '@/types/superadmin';
import type { SubscriptionPackage } from '@/types/subscription-packages';

const STATUSES: AppBillingStatus[] = ['trial', 'active', 'past_due', 'canceled', 'blocked'];

export default function SuperadminCoachDetail() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const coachIdParam = Array.isArray(params.id) ? params.id[0] : params.id;
  const { colors } = useAppTheme();
  const { coaches, loading, error: loadError, reload } = useSuperadminCoaches();
  const plans = useSuperadminStore((s) => s.plans);
  const clients = useSuperadminStore((s) => s.coachClients);
  const updateCoach = useSuperadminStore((s) => s.updateCoach);
  const localRegenerateCoachCode = useSuperadminStore((s) => s.regenerateCoachCode);
  const localSetCoachCodeActive = useSuperadminStore((s) => s.setCoachCodeActive);
  const coach = coaches.find((item) => item.id === coachIdParam);
  const plan = plans.find((item) => item.code === coach?.planCode);
  const coachClients = clients.filter((client) => client.coachId === coachIdParam);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [planCode, setPlanCode] = useState<AppPlanCode>('free');
  const [billingStatus, setBillingStatus] = useState<AppBillingStatus>('trial');
  const [clientLimit, setClientLimit] = useState('');
  const [clientsUsed, setClientsUsed] = useState('');
  const [periodStartsAt, setPeriodStartsAt] = useState('');
  const [periodEndsAt, setPeriodEndsAt] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [codeFeedback, setCodeFeedback] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [showPackagePicker, setShowPackagePicker] = useState(false);
  const [availablePackages, setAvailablePackages] = useState<SubscriptionPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState('');
  const [packageBusy, setPackageBusy] = useState(false);

  useEffect(() => {
    if (!coach) return;
    setName(coach.name);
    setEmail(coach.email);
    setBusinessName(coach.businessName ?? '');
    setPhone(coach.phone ?? '');
    setPlanCode(coach.planCode);
    setBillingStatus(coach.billingStatus);
    setClientLimit(coach.clientLimitOverride === undefined || coach.clientLimitOverride === null ? '' : String(coach.clientLimitOverride));
    setClientsUsed(String(coach.clientsUsed));
    setPeriodStartsAt(coach.periodStartsAt);
    setPeriodEndsAt(coach.periodEndsAt);
  }, [coach]);

  if (!coach) {
    return (
      <SuperadminShell title={loading ? 'Caricamento...' : loadError ? 'Errore' : 'Coach non trovato'}>
        <AppCard style={styles.card}>
          <Text style={{ color: loadError ? colors.rust : colors.inkSoft, fontSize: AppFontSize.sm }}>
            {loading
              ? 'Caricamento coach da Supabase in corso...'
              : loadError
                ? loadError
                : "Il coach richiesto non e' disponibile."}
          </Text>
          {!loading && loadError ? <AppButton label="Riprova" onPress={reload} variant="outline" fullWidth /> : null}
          {!loading ? (
            <AppButton label="Torna alla lista coach" onPress={() => router.replace('/superadmin/coaches' as Href)} fullWidth />
          ) : null}
        </AppCard>
      </SuperadminShell>
    );
  }

  const coachId = coach.id;
  const isSupabaseCoach = coach.source === 'supabase';
  const effectiveClientLimit = clientLimit.trim() === '' ? plan?.clientLimit ?? null : Number(clientLimit);

  // Scrittura reale su Supabase per un coach registrato (2026-07-12, prima
  // disabilitata: vedi docs/DECISIONS.md, voce BUG-011 e voce "Modifica
  // coach"). Nome/nome attivita'/telefono/stato pagamento hanno un
  // equivalente reale diretto (profiles/coach_profiles); email, "Piano"
  // legacy, limite clienti/periodo app restano fuori scope (vedi commenti nel
  // servizio superadmin-coach-admin-service.ts) per un coach locale/demo
  // resta tutto invariato (store locale, nessuna chiamata Supabase).
  async function handleSave() {
    if (!name.trim() || !email.trim()) {
      setError('Nome ed email sono obbligatori.');
      return;
    }

    if (isSupabaseCoach) {
      setSaving(true);
      setError('');
      const profileResult = await updateCoachProfile(coachId, { fullName: name, businessName, phone });
      if (!profileResult.ok) {
        setSaving(false);
        setError(profileResult.message);
        return;
      }
      const statusResult = await setCoachBillingStatus(coachId, billingStatus);
      setSaving(false);
      if (!statusResult.ok) {
        setError(statusResult.message);
        return;
      }
      reload();
      return;
    }

    const parsedLimit = clientLimit.trim() === '' ? undefined : Number(clientLimit);
    const parsedClientsUsed = clientsUsed.trim() === '' ? 0 : Number(clientsUsed);
    if ((parsedLimit !== undefined && Number.isNaN(parsedLimit)) || Number.isNaN(parsedClientsUsed)) {
      setError('Limite clienti e clienti usati devono essere numeri. Il limite puo essere vuoto.');
      return;
    }
    updateCoach(coachId, {
      name: name.trim(),
      email: email.trim(),
      businessName: businessName.trim() || undefined,
      phone: phone.trim() || undefined,
      planCode,
      billingStatus,
      clientLimitOverride: parsedLimit,
      clientsUsed: parsedClientsUsed,
      periodStartsAt,
      periodEndsAt,
    });
    setError('');
  }

  async function toggleBlocked() {
    const nextStatus: AppBillingStatus = billingStatus === 'blocked' ? 'active' : 'blocked';
    setBillingStatus(nextStatus);
    if (isSupabaseCoach) {
      setSaving(true);
      setError('');
      const result = await setCoachBillingStatus(coachId, nextStatus);
      setSaving(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      reload();
      return;
    }
    updateCoach(coachId, { billingStatus: nextStatus });
  }

  async function copyCoachCode() {
    if (!coach) return;
    await Clipboard.setStringAsync(coach.coachCode);
    setCodeFeedback('Codice copiato.');
  }

  async function handleRegenerateCode() {
    if (isSupabaseCoach) {
      setCodeBusy(true);
      setCodeFeedback('');
      const result = await regenerateCoachRegistrationCode(coachId);
      setCodeBusy(false);
      if (!result.ok) {
        setCodeFeedback(result.message);
        return;
      }
      setCodeFeedback(`Nuovo codice: ${result.data}`);
      reload();
      return;
    }
    const nextCode = localRegenerateCoachCode(coachId);
    setCodeFeedback(nextCode ? `Nuovo codice: ${nextCode}` : 'Codice non aggiornato.');
  }

  async function toggleCoachCodeActive() {
    if (!coach) return;
    if (isSupabaseCoach) {
      setCodeBusy(true);
      setCodeFeedback('');
      const result = await setCoachRegistrationCodeActive(coachId, !coach.coachCodeActive);
      setCodeBusy(false);
      if (!result.ok) {
        setCodeFeedback(result.message);
        return;
      }
      setCodeFeedback(!coach.coachCodeActive ? 'Codice attivato.' : 'Codice disattivato.');
      reload();
      return;
    }
    localSetCoachCodeActive(coachId, !coach.coachCodeActive);
    setCodeFeedback(!coach.coachCodeActive ? 'Codice attivato.' : 'Codice disattivato.');
  }

  async function togglePackagePicker() {
    const next = !showPackagePicker;
    setShowPackagePicker(next);
    if (next && availablePackages.length === 0) {
      setPackagesLoading(true);
      setPackagesError('');
      const result = await listActivePackages('coach');
      setPackagesLoading(false);
      if (!result.ok) {
        setPackagesError(result.message);
        return;
      }
      setAvailablePackages(result.data);
    }
  }

  async function handleAssignPackage(packageId: string) {
    setPackageBusy(true);
    setPackagesError('');
    const result = await assignCoachPackage(coachId, packageId);
    setPackageBusy(false);
    if (!result.ok) {
      setPackagesError(result.message);
      return;
    }
    setShowPackagePicker(false);
    reload();
  }

  async function handleCancelSubscription() {
    if (!coach?.activeSubscriptionId) return;
    setPackageBusy(true);
    setPackagesError('');
    const result = await cancelCoachSubscription(coach.activeSubscriptionId);
    setPackageBusy(false);
    if (!result.ok) {
      setPackagesError(result.message);
      return;
    }
    reload();
  }

  return (
    <SuperadminShell title={coach.name} description="Dettaglio coach con modifica manuale e clienti associati.">
      <AppCard style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.grow}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Stato attuale</Text>
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>
              {coach.blocked ? 'Accesso bloccato manualmente' : 'Accesso non bloccato'}
            </Text>
          </View>
          <AppBadge label={getBillingStatusLabel(coach.billingStatus)} tone={statusTone(coach.billingStatus)} />
        </View>
        <View style={styles.dataGrid}>
          <Info label="Piano app" value={plan?.name ?? coach.planCode} />
          <Info label="Stato pagamento" value={getBillingStatusLabel(coach.billingStatus)} />
          <Info label="Limite clienti piano" value={effectiveClientLimit === null ? 'Illimitato' : String(effectiveClientLimit)} />
          <Info label="Scadenza app" value={coach.periodEndsAt} />
        </View>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Pacchetto acquistato</Text>
        {!coach.hasActivePackageSubscription ? (
          <Text style={{ color: colors.rust, fontSize: AppFontSize.sm, fontWeight: '600' }}>
            Nessun abbonamento coach attivo: le nuove registrazioni cliente con il codice di questo coach restano bloccate.
          </Text>
        ) : (
          <View style={styles.dataGrid}>
            <Info label="Pacchetto attivo" value={coach.activePackageName ?? '-'} />
            <Info label="Clienti utilizzati" value={String(coach.clientsUsed)} />
            <Info label="Limite massimo" value={coach.activePackageMaxClients === null ? 'Illimitato' : String(coach.activePackageMaxClients)} />
            <Info
              label="Posti disponibili"
              value={coach.activePackageMaxClients === null ? 'Illimitati' : String(coach.activePackageAvailableSlots ?? 0)}
            />
            <Info label="Scadenza abbonamento" value={coach.activePackageExpiresAt ? formatDate(coach.activePackageExpiresAt) : 'Nessuna scadenza'} />
          </View>
        )}

        {isSupabaseCoach ? (
          <>
            {packagesError ? <Text style={[styles.errorText, { color: colors.rust }]}>{packagesError}</Text> : null}
            <View style={styles.actions}>
              <AppButton
                label={showPackagePicker ? 'Chiudi selezione pacchetto' : coach.hasActivePackageSubscription ? 'Cambia pacchetto' : 'Assegna pacchetto'}
                onPress={togglePackagePicker}
                variant="outline"
                fullWidth
              />
              {coach.hasActivePackageSubscription ? (
                <ToneOutlineButton label="Termina abbonamento" tone="rust" onPress={handleCancelSubscription} disabled={packageBusy} />
              ) : null}
            </View>
            {showPackagePicker ? (
              <View style={styles.packageList}>
                {packagesLoading ? (
                  <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Caricamento pacchetti coach...</Text>
                ) : availablePackages.length === 0 ? (
                  <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Nessun pacchetto coach attivo pubblicato dal superadmin.</Text>
                ) : (
                  availablePackages.map((item) => (
                    <View key={item.id} style={[styles.packageRow, { borderColor: colors.border }]}>
                      <View style={styles.grow}>
                        <Text style={[styles.clientName, { color: colors.ink }]}>{item.name}</Text>
                        <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
                          {item.maxClients === null ? 'Illimitato' : `Limite ${item.maxClients} clienti`} · {item.durationValue}{' '}
                          {item.durationUnit === 'days' ? 'giorni' : 'mesi'}
                        </Text>
                      </View>
                      <AppButton label="Assegna" onPress={() => handleAssignPackage(item.id)} size="sm" loading={packageBusy} />
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={[styles.smallText, { color: colors.inkFaint }]}>
            L'assegnazione di un pacchetto e' disponibile solo per coach registrati su Supabase.
          </Text>
        )}
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Codice coach</Text>
        <View
          style={[
            styles.codeBox,
            {
              borderColor: coach.coachCodeActive ? colors.moss : colors.border,
              backgroundColor: coach.coachCodeActive ? colors.mossSoft : colors.surfaceSubtle,
            },
          ]}>
          <Text style={[styles.codeText, { color: coach.coachCodeActive ? colors.moss : colors.inkSoft }]}>
            {coach.coachCode || 'Nessun codice'}
          </Text>
          <Text style={[styles.codeStatus, { color: coach.coachCodeActive ? colors.moss : colors.inkFaint }]}>
            {coach.coachCode ? (coach.coachCodeActive ? 'Codice attivo' : 'Codice disattivato') : 'Nessun codice registrato per questo coach'}
          </Text>
        </View>
        <View style={styles.codeActions}>
          <AppButton label="Copia codice" onPress={copyCoachCode} variant="outline" fullWidth disabled={!coach.coachCode} />
          <AppButton label="Rigenera codice" onPress={handleRegenerateCode} variant="outline" fullWidth loading={codeBusy} />
          <ToneOutlineButton
            label={coach.coachCodeActive ? 'Disattiva codice' : 'Attiva codice'}
            tone={coach.coachCodeActive ? 'rust' : 'moss'}
            onPress={toggleCoachCodeActive}
            disabled={codeBusy}
          />
        </View>
        {codeFeedback ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{codeFeedback}</Text> : null}
      </AppCard>

      <BillingProfileCard profile={coach.billingProfile} />

      <AppCard style={styles.card}>
        <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Modifica coach</Text>
        {isSupabaseCoach ? (
          <Text style={[styles.smallText, { color: colors.inkFaint }]}>
            Coach registrato su Supabase: nome/nome attivita'/telefono e stato pagamento si salvano davvero sul database. "Piano"
            legacy, limite clienti e periodo app restano solo locali/dimostrativi (usa "Pacchetto acquistato" sopra per il vero
            abbonamento). L'email non e' modificabile da qui.
          </Text>
        ) : null}
        <AppTextField label="Nome" value={name} onChangeText={setName} placeholder="Nome coach" />
        <AppTextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="coach@email.it"
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!isSupabaseCoach}
        />
        <AppTextField label="Nome attivita'" value={businessName} onChangeText={setBusinessName} placeholder="Es. Studio FitCoach" />
        <AppTextField label="Telefono" value={phone} onChangeText={setPhone} placeholder="Es. 333 1234567" keyboardType="phone-pad" />
        <OptionGroup label="Piano" options={plans.map((item) => ({ value: item.code, label: item.name }))} value={planCode} onChange={setPlanCode} disabled={isSupabaseCoach} />
        <OptionGroup
          label="Stato pagamento"
          options={STATUSES.map((status) => ({ value: status, label: getBillingStatusLabel(status) }))}
          value={billingStatus}
          onChange={setBillingStatus}
        />
        <AppTextField label="Limite clienti" value={clientLimit} onChangeText={setClientLimit} placeholder="Vuoto = limite piano" keyboardType="number-pad" editable={!isSupabaseCoach} />
        <AppTextField label="Clienti usati" value={clientsUsed} onChangeText={setClientsUsed} placeholder="0" keyboardType="number-pad" editable={!isSupabaseCoach} />
        <View style={styles.row}>
          <View style={styles.half}>
            <AppTextField label="Inizio periodo" value={periodStartsAt} onChangeText={setPeriodStartsAt} placeholder="2026-07-08" editable={!isSupabaseCoach} />
          </View>
          <View style={styles.half}>
            <AppTextField label="Fine periodo" value={periodEndsAt} onChangeText={setPeriodEndsAt} placeholder="2026-08-08" editable={!isSupabaseCoach} />
          </View>
        </View>
        {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}
        <View style={styles.actions}>
          <ToneOutlineButton
            label={billingStatus === 'blocked' ? 'Sblocca coach' : 'Blocca coach'}
            tone={billingStatus === 'blocked' ? 'moss' : 'rust'}
            onPress={toggleBlocked}
            disabled={saving}
          />
          <AppButton label="Salva modifiche" onPress={handleSave} fullWidth loading={saving} />
        </View>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Clienti attivi</Text>
        {coachClients.length === 0 ? (
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessun cliente attivo associato a questo coach.</Text>
        ) : (
          coachClients.map((client) => <ClientRow key={client.id} client={client} />)
        )}
      </AppCard>
    </SuperadminShell>
  );
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return value;
  }
}

function statusTone(status: AppBillingStatus): AppBadgeTone {
  if (status === 'active') return 'moss';
  if (status === 'trial') return 'amber';
  if (status === 'canceled') return 'neutral';
  return 'rust';
}

// Bottone outline colorato per semantica (blocca/sblocca, attiva/disattiva):
// stessa forma di AppButton variant="outline" ma con bordo/testo colorati
// dinamicamente (rust/moss), non supportato da AppButton (colore fisso ink).
function ToneOutlineButton({
  label,
  tone,
  onPress,
  disabled = false,
}: {
  label: string;
  tone: 'moss' | 'rust';
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  const color = tone === 'moss' ? colors.moss : colors.rust;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={[styles.toneButton, { borderColor: color, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={[styles.toneButtonLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.info}>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

function ClientRow({ client }: { client: DemoCoachClient }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.clientRow, { borderColor: colors.border }]}>
      <View style={styles.grow}>
        <Text style={[styles.clientName, { color: colors.ink }]}>{client.name}</Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>{client.contact ?? 'Contatto non disponibile'}</Text>
      </View>
      <View style={styles.clientMeta}>
        <Text style={[styles.clientName, { color: colors.ink }]}>
          {client.status && isAppBillingStatus(client.status) ? getBillingStatusLabel(client.status) : client.status ?? '-'}
        </Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>{client.createdAt ?? '-'}</Text>
      </View>
    </View>
  );
}

function BillingProfileCard({ profile }: { profile: CoachBillingProfile | undefined }) {
  const { colors } = useAppTheme();
  return (
    <AppCard style={styles.card}>
      <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Dati fatturazione</Text>
      {!profile ? (
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Dati fatturazione non ancora compilati.</Text>
      ) : (
        <View style={styles.dataGrid}>
          <Info label="Tipo soggetto" value={getBillingSubjectLabel(profile.subjectType)} />
          <Info label="Nome/ragione sociale" value={profile.legalName} />
          <Info label="Email fatturazione" value={profile.billingEmail} />
          <Info label="Nazione" value={profile.country} />
          <Info label="Partita IVA" value={profile.vatNumber ?? '-'} />
          <Info label="Codice fiscale" value={profile.fiscalCode ?? '-'} />
          <Info label="Indirizzo" value={profile.address ?? '-'} />
          <Info label="CAP" value={profile.postalCode ?? '-'} />
          <Info label="Comune" value={profile.city ?? '-'} />
          <Info label="Provincia" value={profile.province ?? '-'} />
          <Info label="PEC" value={profile.pec ?? '-'} />
          <Info label="Codice SDI" value={profile.sdiCode ?? '-'} />
        </View>
      )}
    </AppCard>
  );
}

function getBillingSubjectLabel(subjectType: CoachBillingSubjectType) {
  const labels: Record<CoachBillingSubjectType, string> = {
    private: 'Privato',
    freelancer: 'Libero professionista',
    sole_proprietorship: 'Ditta individuale',
    company: 'Societa',
  };
  return labels[subjectType];
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.field, disabled && styles.fieldDisabled]}>
      <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>{label}</Text>
      <View style={styles.options}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => !disabled && onChange(option.value)}
              disabled={disabled}
              hitSlop={4}
              style={[styles.option, { borderColor: colors.moss, backgroundColor: active ? colors.moss : 'transparent' }]}>
              <Text style={[styles.optionLabel, { color: active ? colors.onMoss : colors.moss }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[3],
  },
  packageList: {
    gap: AppSpacing[2],
  },
  packageRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    paddingTop: AppSpacing[2],
  },
  cardTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  grow: {
    flex: 1,
    minWidth: 0,
  },
  dataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  info: {
    flexBasis: 130,
    flexGrow: 1,
    gap: 2,
  },
  infoValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  field: {
    gap: AppSpacing[2],
  },
  fieldDisabled: {
    opacity: 0.5,
  },
  fieldLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
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
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  option: {
    borderRadius: AppRadius.md,
    borderWidth: 1.5,
    minHeight: 40,
    paddingHorizontal: AppSpacing[3],
    justifyContent: 'center',
  },
  optionLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  codeBox: {
    alignItems: 'center',
    borderRadius: AppRadius.xl,
    borderWidth: 1.5,
    gap: AppSpacing[1],
    padding: AppSpacing[3],
  },
  codeText: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  codeStatus: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  codeActions: {
    gap: AppSpacing[2],
  },
  errorText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  actions: {
    gap: AppSpacing[2],
  },
  toneButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppRadius.lg,
    borderWidth: 1.5,
    minHeight: 44,
    width: '100%',
  },
  toneButtonLabel: {
    fontSize: 15,
    fontWeight: '800',
  },
  clientRow: {
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    paddingTop: AppSpacing[2],
  },
  clientName: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  clientMeta: {
    alignItems: 'flex-end',
    maxWidth: 120,
  },
});
