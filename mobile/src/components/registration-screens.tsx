import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from './card';
import { ScreenBackground } from './screen-background';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';

import { canCoachAcceptClients, generateCoachCode, normalizeCoachCode } from '@/lib/coach-code';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEMO_USERS, useAuthStore, type CoachAuthAccount } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { Client, ClientAccount } from '@/types/client';
import type { CoachBillingProfile, CoachBillingSubjectType } from '@/types/superadmin';

const SUBJECT_OPTIONS: { value: CoachBillingSubjectType; label: string }[] = [
  { value: 'private', label: 'Privato' },
  { value: 'freelancer', label: 'Libero professionista' },
  { value: 'sole_proprietorship', label: 'Ditta individuale' },
  { value: 'company', label: 'Societa' },
];

export function CoachRegistrationScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const coaches = useSuperadminStore((s) => s.coaches);
  const createCoach = useSuperadminStore((s) => s.createCoach);
  const addCoachAccount = useAuthStore((s) => s.addCoachAccount);
  const coachAccounts = useAuthStore((s) => s.coachAccounts);
  const clientAccounts = useClientStore((s) => s.accounts);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [subjectType, setSubjectType] = useState<CoachBillingSubjectType>('freelancer');
  const [legalName, setLegalName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [fiscalCode, setFiscalCode] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [country, setCountry] = useState('Italia');
  const [pec, setPec] = useState('');
  const [sdiCode, setSdiCode] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');
  const [error, setError] = useState('');

  function handleRegister() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!fullName.trim() || !normalizedEmail || password.length < 6) {
      setError('Inserisci nome, email e una password di almeno 6 caratteri.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Le password non coincidono.');
      return;
    }
    if (!legalName.trim() || !billingEmail.trim() || !country.trim()) {
      setError('Nome o ragione sociale, email fatturazione e nazione sono obbligatori.');
      return;
    }
    const normalizedSdiCode = sdiCode.trim().toUpperCase();
    const hasItalianVat = isItaly(country) && vatNumber.trim().length > 0;
    if (hasItalianVat && !pec.trim() && !normalizedSdiCode) {
      setError('Per partita IVA italiana inserisci PEC oppure Codice SDI. Usa 0000000 se non comunicato.');
      return;
    }
    if (
      DEMO_USERS.some((user) => user.email === normalizedEmail) ||
      coachAccounts.some((account) => account.email.toLowerCase() === normalizedEmail) ||
      clientAccounts.some((account) => account.email.toLowerCase() === normalizedEmail)
    ) {
      setError('Esiste gia un account con questa email.');
      return;
    }

    const coachCode = generateCoachCode(coaches.map((coach) => coach.coachCode));
    const billingProfile: CoachBillingProfile = {
      subjectType,
      legalName: legalName.trim(),
      vatNumber: vatNumber.trim() || undefined,
      fiscalCode: fiscalCode.trim() || undefined,
      address: billingAddress.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      city: city.trim() || undefined,
      province: province.trim().toUpperCase() || undefined,
      country: country.trim(),
      pec: pec.trim() || undefined,
      sdiCode: normalizedSdiCode || undefined,
      billingEmail: billingEmail.trim().toLowerCase(),
    };
    const now = new Date();
    const periodEndsAt = new Date(now);
    periodEndsAt.setDate(periodEndsAt.getDate() + 14);
    const coach = createCoach({
      name: fullName.trim(),
      email: normalizedEmail,
      phone: phone.trim() || undefined,
      businessName: businessName.trim() || undefined,
      billingProfile,
      planCode: 'free',
      billingStatus: 'trial',
      clientsUsed: 0,
      periodStartsAt: now.toISOString().slice(0, 10),
      periodEndsAt: periodEndsAt.toISOString().slice(0, 10),
      coachCode,
      coachCodeActive: true,
    });
    const account: CoachAuthAccount = {
      id: `coach_account_${Date.now()}`,
      coachId: coach.id,
      email: normalizedEmail,
      password,
      role: 'coach',
      createdAt: now.toISOString(),
    };
    addCoachAccount(account);
    setCreatedCode(coach.coachCode);
    setCopyFeedback('');
    setError('');
  }

  async function copyCode() {
    if (!createdCode) return;
    await Clipboard.setStringAsync(createdCode);
    setCopyFeedback('Codice copiato.');
  }

  if (createdCode) {
    return (
      <ScreenBackground>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? Spacing.six : insets.top + Spacing.five }]}>
          <Card style={styles.form}>
            <ThemedText type="title" style={styles.title}>
              Il tuo codice coach
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Condividi questo codice con i tuoi clienti per consentire la registrazione.
            </ThemedText>
            <View style={[styles.codeBox, { borderColor: theme.primary, backgroundColor: theme.softRed }]}>
              <ThemedText type="subtitle" style={[styles.codeText, { color: theme.primary }]}>
                {createdCode}
              </ThemedText>
            </View>
            <Pressable onPress={copyCode} hitSlop={6}>
              <View style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" themeColor="onPrimary">
                  Copia codice
                </ThemedText>
              </View>
            </Pressable>
            {copyFeedback ? <ThemedText type="small" themeColor="statusActive">{copyFeedback}</ThemedText> : null}
            <Pressable onPress={() => router.replace('/' as Href)} hitSlop={6}>
              <ThemedText type="smallBold" themeColor="primary" style={styles.centerText}>
                Vai al login
              </ThemedText>
            </Pressable>
          </Card>
        </ScrollView>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three }]}>
        <Card style={styles.form}>
          <ThemedText type="title" style={styles.title}>
            Registrati come coach
          </ThemedText>
          <Field label="Nome e cognome">
            <ThemedTextInput value={fullName} onChangeText={setFullName} placeholder="Es. Laura Bassi" />
          </Field>
          <Field label="Email">
            <ThemedTextInput value={email} onChangeText={setEmail} placeholder="coach@email.it" autoCapitalize="none" keyboardType="email-address" />
          </Field>
          <Field label="Password">
            <ThemedTextInput value={password} onChangeText={setPassword} placeholder="Minimo 6 caratteri" secureTextEntry />
          </Field>
          <Field label="Conferma password">
            <ThemedTextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Ripeti password" secureTextEntry />
          </Field>
          <Field label="Telefono opzionale">
            <ThemedTextInput value={phone} onChangeText={setPhone} placeholder="+39 333 0000000" keyboardType="phone-pad" />
          </Field>
          <Field label="Nome attivita/studio opzionale">
            <ThemedTextInput value={businessName} onChangeText={setBusinessName} placeholder="Es. Studio Performance" />
          </Field>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Dati attivita e fatturazione
            </ThemedText>
          </View>
          <Field label="Tipo soggetto">
            <OptionGroup options={SUBJECT_OPTIONS} value={subjectType} onChange={setSubjectType} />
          </Field>
          <Field label="Nome attivita o ragione sociale">
            <ThemedTextInput value={legalName} onChangeText={setLegalName} placeholder="Es. Studio Performance SRL" />
          </Field>
          <Field label="Partita IVA">
            <ThemedTextInput value={vatNumber} onChangeText={setVatNumber} placeholder="Es. 12345678901" keyboardType="number-pad" />
          </Field>
          <Field label="Codice fiscale">
            <ThemedTextInput value={fiscalCode} onChangeText={(value) => setFiscalCode(value.toUpperCase())} placeholder="Codice fiscale" autoCapitalize="characters" />
          </Field>
          <Field label="Indirizzo">
            <ThemedTextInput value={billingAddress} onChangeText={setBillingAddress} placeholder="Via e numero civico" />
          </Field>
          <View style={styles.inlineFields}>
            <Field label="CAP" style={styles.inlineSmall}>
              <ThemedTextInput value={postalCode} onChangeText={setPostalCode} placeholder="00100" keyboardType="number-pad" />
            </Field>
            <Field label="Comune" style={styles.inlineLarge}>
              <ThemedTextInput value={city} onChangeText={setCity} placeholder="Roma" />
            </Field>
          </View>
          <View style={styles.inlineFields}>
            <Field label="Provincia" style={styles.inlineSmall}>
              <ThemedTextInput value={province} onChangeText={(value) => setProvince(value.toUpperCase())} placeholder="RM" autoCapitalize="characters" />
            </Field>
            <Field label="Nazione" style={styles.inlineLarge}>
              <ThemedTextInput value={country} onChangeText={setCountry} placeholder="Italia" />
            </Field>
          </View>
          <Field label="PEC">
            <ThemedTextInput value={pec} onChangeText={setPec} placeholder="nome@pec.it" autoCapitalize="none" keyboardType="email-address" />
          </Field>
          <Field label="Codice SDI">
            <ThemedTextInput value={sdiCode} onChangeText={(value) => setSdiCode(value.toUpperCase())} placeholder="0000000 se non comunicato" autoCapitalize="characters" maxLength={7} />
          </Field>
          <Field label="Email fatturazione">
            <ThemedTextInput value={billingEmail} onChangeText={setBillingEmail} placeholder="fatture@email.it" autoCapitalize="none" keyboardType="email-address" />
          </Field>
          {error ? <ThemedText type="small" themeColor="statusExpired">{error}</ThemedText> : null}
          <Pressable onPress={handleRegister} hitSlop={6}>
            <View style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
              <ThemedText type="smallBold" themeColor="onPrimary">
                Crea account coach
              </ThemedText>
            </View>
          </Pressable>
          <Pressable onPress={() => router.replace('/' as Href)} hitSlop={6}>
            <ThemedText type="smallBold" themeColor="primary" style={styles.centerText}>
              Torna al login
            </ThemedText>
          </Pressable>
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
}

export function ClientRegistrationScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const plans = useSuperadminStore((s) => s.plans);
  const findCoachByCode = useSuperadminStore((s) => s.findCoachByCode);
  const addCoachClient = useSuperadminStore((s) => s.addCoachClient);
  const addClient = useClientStore((s) => s.addClient);
  const addAccount = useClientStore((s) => s.addAccount);
  const accounts = useClientStore((s) => s.accounts);
  const coachAccounts = useAuthStore((s) => s.coachAccounts);
  const loginAsClient = useAuthStore((s) => s.loginAsClient);
  const [coachCode, setCoachCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  function handleRegister() {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = normalizeCoachCode(coachCode);
    if (!normalizedCode || !fullName.trim() || !normalizedEmail || !password || !confirmPassword) {
      setError('Tutti i campi sono obbligatori, incluso il codice coach.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Le password non coincidono.');
      return;
    }
    if (password.length < 6) {
      setError('La password deve avere almeno 6 caratteri.');
      return;
    }
    if (
      DEMO_USERS.some((user) => user.email === normalizedEmail) ||
      accounts.some((account) => account.email.toLowerCase() === normalizedEmail) ||
      coachAccounts.some((account) => account.email.toLowerCase() === normalizedEmail)
    ) {
      setError('Esiste gia un account con questa email.');
      return;
    }

    const coach = findCoachByCode(normalizedCode);
    if (!coach) {
      setError('Codice coach non valido.');
      return;
    }

    const plan = plans.find((item) => item.code === coach.planCode);
    const eligibility = canCoachAcceptClients(coach, plan);
    if (!eligibility.allowed) {
      setError(eligibility.reason);
      return;
    }

    const now = new Date().toISOString();
    const { firstName, lastName } = splitFullName(fullName.trim());
    const clientId = `client-${Date.now()}`;
    const client: Client = {
      id: clientId,
      firstName,
      lastName,
      email: normalizedEmail,
      goal: '',
      notes: '',
      status: 'attivo',
      createdAt: now,
      coachId: coach.id,
      linkedByCode: coach.coachCode,
    };
    const account: ClientAccount = {
      id: `acc-${Date.now()}`,
      clientId,
      username: normalizedEmail,
      email: normalizedEmail,
      temporaryPassword: password,
      role: 'cliente',
      mustChangePassword: false,
      status: 'active',
      createdAt: now,
    };

    addClient(client);
    addAccount(account);
    addCoachClient({
      id: `coach_client_${Date.now()}`,
      coachId: coach.id,
      clientId,
      name: `${firstName} ${lastName}`.trim(),
      contact: normalizedEmail,
      status: 'active',
      createdAt: now,
      linkedByCode: coach.coachCode,
    });
    loginAsClient(clientId, normalizedEmail);
    router.replace('/cliente-home');
  }

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three }]}>
        <Card style={styles.form}>
          <ThemedText type="title" style={styles.title}>
            Registrati come cliente
          </ThemedText>
          <Field label="Codice coach">
            <ThemedTextInput value={coachCode} onChangeText={(value) => setCoachCode(normalizeCoachCode(value))} placeholder="FC-8KQ4-MR2P" autoCapitalize="characters" />
          </Field>
          <Field label="Nome e cognome">
            <ThemedTextInput value={fullName} onChangeText={setFullName} placeholder="Es. Anna Rossi" />
          </Field>
          <Field label="Email">
            <ThemedTextInput value={email} onChangeText={setEmail} placeholder="cliente@email.it" autoCapitalize="none" keyboardType="email-address" />
          </Field>
          <Field label="Password">
            <ThemedTextInput value={password} onChangeText={setPassword} placeholder="Minimo 6 caratteri" secureTextEntry />
          </Field>
          <Field label="Conferma password">
            <ThemedTextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Ripeti password" secureTextEntry />
          </Field>
          {error ? <ThemedText type="small" themeColor="statusExpired">{error}</ThemedText> : null}
          <Pressable onPress={handleRegister} hitSlop={6}>
            <View style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
              <ThemedText type="smallBold" themeColor="onPrimary">
                Crea account cliente
              </ThemedText>
            </View>
          </Pressable>
          <Pressable onPress={() => router.replace('/' as Href)} hitSlop={6}>
            <ThemedText type="smallBold" themeColor="primary" style={styles.centerText}>
              Torna al login
            </ThemedText>
          </Pressable>
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
}

function Field({ label, children, style }: { label: string; children: ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
    </View>
  );
}

function OptionGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.options}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            hitSlop={4}
            style={[
              styles.option,
              { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.softRed : theme.backgroundElement },
            ]}>
            <ThemedText type="smallBold" style={{ color: active ? theme.primary : theme.textSecondary }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function splitFullName(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? '' };
}

function isItaly(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === 'italia' || normalized === 'italy' || normalized === 'it';
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: Spacing.three,
    justifyContent: 'center',
    paddingBottom: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  form: {
    gap: Spacing.three,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
  },
  field: {
    gap: Spacing.two,
  },
  sectionHeader: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingTop: Spacing.three,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  option: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  inlineFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  inlineSmall: {
    flexBasis: 104,
    flexGrow: 1,
  },
  inlineLarge: {
    flexBasis: 160,
    flexGrow: 2,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: Radius.md,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  centerText: {
    textAlign: 'center',
  },
  codeBox: {
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  codeText: {
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
  },
});
