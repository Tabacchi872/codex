import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppScreen, AppTextField } from '@/components/ui';
import { signUpClientWithCoachCode, signUpCoach } from '@/lib/auth-service';
import { canCoachAcceptClients, generateCoachCode, normalizeCoachCode } from '@/lib/coach-code';
import { supabaseConfig } from '@/lib/supabase';
import { DEMO_USERS, useAuthStore, type CoachAuthAccount } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';
import type { Client, ClientAccount } from '@/types/client';
import type { CoachBillingProfile, CoachBillingSubjectType } from '@/types/superadmin';

const SUBJECT_OPTIONS: { value: CoachBillingSubjectType; label: string }[] = [
  { value: 'private', label: 'Privato' },
  { value: 'freelancer', label: 'Libero professionista' },
  { value: 'sole_proprietorship', label: 'Ditta individuale' },
  { value: 'company', label: 'Societa' },
];

export function CoachRegistrationScreen() {
  const { colors } = useAppTheme();
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
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmailConfirmation, setPendingEmailConfirmation] = useState(false);

  async function handleRegister() {
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

    let coachCode = generateCoachCode(coaches.map((coach) => coach.coachCode));

    if (__DEV__) {
      console.log('START_SIGNUP_COACH', { email: normalizedEmail });
      console.log('SUPABASE_CONFIGURED', supabaseConfig.isConfigured);
    }

    // Se Supabase e' configurato, l'account reale (Supabase Auth + profiles +
    // coach_profiles + billing_profiles + registration_codes) viene creato per
    // primo: e' la fonte di verita' per email duplicate/validazione. Il record
    // locale sotto viene comunque creato in parallelo con lo stesso coachCode,
    // perche' il resto dell'app (dashboard coach, superadmin, clienti) legge
    // ancora solo dagli store locali in questa fase — vedi docs/DECISIONS.md.
    // Se signUpCoach fallisce, la funzione si ferma qui (return): NON deve mai
    // proseguire a creare il coach solo in locale, altrimenti "Il tuo codice
    // coach" comparirebbe come se la registrazione fosse riuscita, mascherando
    // che su Supabase non e' stato creato nulla.
    if (supabaseConfig.isConfigured) {
      setSubmitting(true);
      setError('');
      let result: Awaited<ReturnType<typeof signUpCoach>>;
      try {
        result = await signUpCoach({
          fullName: fullName.trim(),
          email: normalizedEmail,
          password,
          phone: phone.trim() || undefined,
          businessName: businessName.trim() || undefined,
          billingProfile,
        });
      } catch (err) {
        // Difesa aggiuntiva: signUpCoach (auth-service.ts) gia' converte le
        // proprie eccezioni in un risultato leggibile, ma se qualcosa di
        // imprevisto sfuggisse comunque, il bottone non deve restare bloccato
        // su "Creazione account..." senza alcun errore visibile.
        setSubmitting(false);
        const message = err instanceof Error ? err.message : 'Errore imprevisto durante la registrazione. Riprova.';
        if (__DEV__) console.error('SIGNUP_COACH_ERROR', err);
        setError(message);
        return;
      }
      setSubmitting(false);
      if (!result.ok) {
        if (__DEV__) console.error('SIGNUP_COACH_ERROR', result);
        setError(result.message);
        return;
      }
      if (__DEV__) {
        console.log('SIGNUP_COACH_SUCCESS', {
          userId: result.data.userId,
          email: normalizedEmail,
          session: result.data.session ? 'present' : 'null',
        });
      }
      // Con "Confirm email" attivo su Supabase, data.session torna null finche'
      // l'utente non clicca il link di conferma: in quel caso coachCode e'
      // anch'esso null (registration_codes non e' stato ancora scritto, nessuna
      // sessione => RLS blocca) e verra' generato al primo login reale
      // (ensureCoachOnboarding). Il codice locale generato sopra resta solo per
      // il mirror locale, NON va mostrato all'utente: non esiste ancora su
      // Supabase, un cliente non potrebbe usarlo per registrarsi.
      if (result.data.coachCode) {
        coachCode = result.data.coachCode;
      }
      setPendingEmailConfirmation(result.data.session === null);
    }

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
      <AppScreen contentStyle={styles.content} bottomTabInset={false}>
        <AppCard style={styles.form}>
          {pendingEmailConfirmation ? (
            <>
              <Text style={[AppTextStyle.hero, styles.title, { color: colors.ink }]}>Controlla la tua email</Text>
              <Text style={[styles.bodyText, { color: colors.inkSoft }]}>
                Registrazione completata. Controlla la tua email per confermare l&apos;account: il tuo codice coach sara&apos;
                disponibile al primo accesso, dopo la conferma.
              </Text>
            </>
          ) : (
            <>
              <Text style={[AppTextStyle.hero, styles.title, { color: colors.ink }]}>Il tuo codice coach</Text>
              <Text style={[styles.bodyText, { color: colors.inkSoft }]}>
                Condividi questo codice con i tuoi clienti per consentire la registrazione.
              </Text>
              <View style={[styles.codeBox, { borderColor: colors.moss, backgroundColor: colors.mossSoft }]}>
                <Text style={[styles.codeText, { color: colors.moss }]}>{createdCode}</Text>
              </View>
              <AppButton label="Copia codice" onPress={copyCode} fullWidth />
              {copyFeedback ? <Text style={[styles.feedback, { color: colors.moss }]}>{copyFeedback}</Text> : null}
            </>
          )}
          <Pressable onPress={() => router.replace('/' as Href)} hitSlop={6}>
            <Text style={[styles.link, { color: colors.moss }]}>Vai al login</Text>
          </Pressable>
        </AppCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentStyle={styles.content} bottomTabInset={false}>
      <AppCard style={styles.form}>
        <Text style={[AppTextStyle.hero, styles.title, { color: colors.ink }]}>Registrati come coach</Text>
        <AppTextField label="Nome e cognome" value={fullName} onChangeText={setFullName} placeholder="Es. Laura Bassi" />
        <AppTextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="coach@email.it"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <AppTextField label="Password" value={password} onChangeText={setPassword} placeholder="Minimo 6 caratteri" secureTextEntry />
        <AppTextField
          label="Conferma password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Ripeti password"
          secureTextEntry
        />
        <AppTextField label="Telefono opzionale" value={phone} onChangeText={setPhone} placeholder="+39 333 0000000" keyboardType="phone-pad" />
        <AppTextField
          label="Nome attivita/studio opzionale"
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="Es. Studio Performance"
        />

        <View style={[styles.sectionHeader, { borderTopColor: colors.border }]}>
          <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Dati attivita e fatturazione</Text>
        </View>

        <Field label="Tipo soggetto">
          <OptionGroup options={SUBJECT_OPTIONS} value={subjectType} onChange={setSubjectType} />
        </Field>
        <AppTextField
          label="Nome attivita o ragione sociale"
          value={legalName}
          onChangeText={setLegalName}
          placeholder="Es. Studio Performance SRL"
        />
        <AppTextField
          label="Partita IVA"
          value={vatNumber}
          onChangeText={setVatNumber}
          placeholder="Es. 12345678901"
          keyboardType="number-pad"
        />
        <AppTextField
          label="Codice fiscale"
          value={fiscalCode}
          onChangeText={(value) => setFiscalCode(value.toUpperCase())}
          placeholder="Codice fiscale"
          autoCapitalize="characters"
        />
        <AppTextField label="Indirizzo" value={billingAddress} onChangeText={setBillingAddress} placeholder="Via e numero civico" />
        <View style={styles.inlineFields}>
          <View style={styles.inlineSmall}>
            <AppTextField label="CAP" value={postalCode} onChangeText={setPostalCode} placeholder="00100" keyboardType="number-pad" />
          </View>
          <View style={styles.inlineLarge}>
            <AppTextField label="Comune" value={city} onChangeText={setCity} placeholder="Roma" />
          </View>
        </View>
        <View style={styles.inlineFields}>
          <View style={styles.inlineSmall}>
            <AppTextField
              label="Provincia"
              value={province}
              onChangeText={(value) => setProvince(value.toUpperCase())}
              placeholder="RM"
              autoCapitalize="characters"
            />
          </View>
          <View style={styles.inlineLarge}>
            <AppTextField label="Nazione" value={country} onChangeText={setCountry} placeholder="Italia" />
          </View>
        </View>
        <AppTextField label="PEC" value={pec} onChangeText={setPec} placeholder="nome@pec.it" autoCapitalize="none" keyboardType="email-address" />
        <AppTextField
          label="Codice SDI"
          value={sdiCode}
          onChangeText={(value) => setSdiCode(value.toUpperCase())}
          placeholder="0000000 se non comunicato"
          autoCapitalize="characters"
          maxLength={7}
        />
        <AppTextField
          label="Email fatturazione"
          value={billingEmail}
          onChangeText={setBillingEmail}
          placeholder="fatture@email.it"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}
        <AppButton
          label={submitting ? 'Creazione account...' : 'Crea account coach'}
          onPress={handleRegister}
          loading={submitting}
          disabled={submitting}
          fullWidth
          size="lg"
        />
        <Pressable onPress={() => router.replace('/' as Href)} hitSlop={6}>
          <Text style={[styles.link, { color: colors.moss }]}>Torna al login</Text>
        </Pressable>
      </AppCard>
    </AppScreen>
  );
}

export function ClientRegistrationScreen() {
  const { colors } = useAppTheme();
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
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmailConfirmation, setPendingEmailConfirmation] = useState(false);

  async function handleRegister() {
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
    let clientId = `client-${Date.now()}`;

    // Se Supabase e' configurato, la validazione di codice/coach bloccato/
    // limite avviene su registration_codes e coach_profiles reali (vedi
    // lib/auth-service.ts). Il coach locale potrebbe non esistere (registrato
    // solo su Supabase): il cliente viene comunque creato in locale per far
    // funzionare da subito le schermate cliente, non ancora migrate — vedi
    // docs/DECISIONS.md. L'id locale del cliente usa lo stesso id dell'utente
    // Supabase (result.data.userId), non un id generato a parte: cosi' un
    // login successivo (anche su un altro device/browser, vedi login-screen.tsx
    // + lib/auth-service.ts loadClientProfile) ritrova lo stesso cliente invece
    // di doverne ricostruire uno nuovo con un id diverso.
    if (supabaseConfig.isConfigured) {
      setSubmitting(true);
      const result = await signUpClientWithCoachCode({
        coachCode: normalizedCode,
        fullName: fullName.trim(),
        email: normalizedEmail,
        password,
      });
      setSubmitting(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      clientId = result.data.userId;
      if (!result.data.session) {
        // Con "Confirm email" attivo, l'utente esiste su Supabase ma non ha
        // ancora una sessione: NON va fatto login automatico ne' scritto il
        // mirror locale come se fosse gia' attivo. Al primo login reale (dopo
        // conferma), login-screen.tsx ricostruisce il profilo da Supabase
        // (loadClientProfile), quindi qui non serve altro.
        setPendingEmailConfirmation(true);
        return;
      }
    } else {
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
    }

    const now = new Date().toISOString();
    const { firstName, lastName } = splitFullName(fullName.trim());
    const client: Client = {
      id: clientId,
      firstName,
      lastName,
      email: normalizedEmail,
      goal: '',
      notes: '',
      status: 'attivo',
      createdAt: now,
      coachId: coach?.id,
      linkedByCode: coach?.coachCode ?? normalizedCode,
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
    if (coach) {
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
    }
    loginAsClient(clientId, normalizedEmail);
    router.replace('/cliente-home');
  }

  if (pendingEmailConfirmation) {
    return (
      <AppScreen contentStyle={styles.content} bottomTabInset={false}>
        <AppCard style={styles.form}>
          <Text style={[AppTextStyle.hero, styles.title, { color: colors.ink }]}>Controlla la tua email</Text>
          <Text style={[styles.bodyText, { color: colors.inkSoft }]}>
            Registrazione completata. Controlla la tua email per confermare l&apos;account. Dopo la conferma potrai accedere
            normalmente.
          </Text>
          <AppButton label="Torna al login" onPress={() => router.replace('/' as Href)} fullWidth />
        </AppCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentStyle={styles.content} bottomTabInset={false}>
      <AppCard style={styles.form}>
        <Text style={[AppTextStyle.hero, styles.title, { color: colors.ink }]}>Registrati come cliente</Text>
        <AppTextField
          label="Codice coach"
          value={coachCode}
          onChangeText={(value) => setCoachCode(normalizeCoachCode(value))}
          placeholder="FC-8KQ4-MR2P"
          autoCapitalize="characters"
        />
        <AppTextField label="Nome e cognome" value={fullName} onChangeText={setFullName} placeholder="Es. Anna Rossi" />
        <AppTextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="cliente@email.it"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <AppTextField label="Password" value={password} onChangeText={setPassword} placeholder="Minimo 6 caratteri" secureTextEntry />
        <AppTextField
          label="Conferma password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Ripeti password"
          secureTextEntry
        />
        {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}
        <AppButton
          label={submitting ? 'Creazione account...' : 'Crea account cliente'}
          onPress={handleRegister}
          loading={submitting}
          disabled={submitting}
          fullWidth
          size="lg"
        />
        <Pressable onPress={() => router.replace('/' as Href)} hitSlop={6}>
          <Text style={[styles.link, { color: colors.moss }]}>Torna al login</Text>
        </Pressable>
      </AppCard>
    </AppScreen>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>{label}</Text>
      {children}
    </View>
  );
}

// Selettore a scelta singola (Tipo soggetto): non e' una CTA, quindi non usa
// AppButton — stesso linguaggio del tab-selector "Da fare/Passati" nel mockup
// (moss pieno se attivo, contorno moss se inattivo), coerente con AppButton
// solo nei token di colore/radius, non nel componente.
function OptionGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.options}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            hitSlop={4}
            style={[styles.option, { borderColor: colors.moss, backgroundColor: active ? colors.moss : 'transparent' }]}>
            <Text style={[styles.optionLabel, { color: active ? colors.onMoss : colors.moss }]}>{option.label}</Text>
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
    justifyContent: 'center',
  },
  form: {
    gap: AppSpacing[3],
  },
  title: {
    fontSize: 28,
  },
  bodyText: {
    fontSize: AppFontSize.base,
    fontWeight: '500',
    lineHeight: AppFontSize.base * 1.4,
  },
  field: {
    gap: AppSpacing[2],
  },
  fieldLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  sectionHeader: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: AppSpacing[3],
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
    paddingVertical: AppSpacing[2],
    justifyContent: 'center',
  },
  optionLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  inlineFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  inlineSmall: {
    flexBasis: 104,
    flexGrow: 1,
  },
  inlineLarge: {
    flexBasis: 160,
    flexGrow: 2,
  },
  errorText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  link: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  feedback: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  codeBox: {
    alignItems: 'center',
    borderRadius: AppRadius.xl,
    borderWidth: 1.5,
    padding: AppSpacing[3],
  },
  codeText: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
});
