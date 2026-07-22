# IOS_SETUP.md

Configurazione iOS del progetto FitCoach (Expo Managed / Continuous Native Generation — nessuna cartella `ios/` committata, generata da EAS al momento della build). Android e Web restano invariati: nessuna configurazione esistente per quelle piattaforme e' stata toccata.

## 1. Identita' app

- **Bundle identifier iOS**: `com.fitcoachapp.mobile` (stessa reverse-domain family del package Android `com.fitcoachapp.mobile`, che NON e' stato modificato).
- **Scheme deep link**: `mobile` (`mobile://...`) — gia' esistente in `app.json`, non e' stato inventato un nuovo scheme.
- **Versioning**: `cli.appVersionSource: "remote"` in `eas.json` — build number iOS gestito automaticamente da EAS (`ios.buildNumber` NON impostato a mano in `app.json`, di proposito: impostarlo manualmente andrebbe in conflitto col versioning remoto).
- **Export compliance**: `ios.config.usesNonExemptEncryption: false` in `app.json` (l'app usa solo HTTPS/TLS standard, nessuna crittografia proprietaria).

## 2. Cosa e' stato modificato

| File | Modifica |
|---|---|
| `mobile/app.json` | Aggiunta sezione `ios` (bundleIdentifier, supportsTablet, config.usesNonExemptEncryption); `expo-image-picker` plugin: `cameraPermission: false` (fotocamera non usata in app, mai chiamata `launchCameraAsync`). |
| `mobile/eas.json` | Aggiunto `submit.production.ios.ascAppId` (placeholder, vedi sotto). Profili `development`/`preview`/`production` gia' validi per iOS senza modifiche aggiuntive: le opzioni top-level (`developmentClient`, `distribution`, `autoIncrement`) si applicano gia' a tutte le piattaforme; non serve un blocco `ios` dedicato per queste tre voci (a differenza di Android, che ha `buildType: apk` come override specifico della piattaforma). |
| `mobile/src/constants/app-info.ts` | Aggiunti `PRIVACY_POLICY_URL`/`TERMS_OF_SERVICE_URL` (placeholder espliciti, vedi sotto — dato mancante). |
| `mobile/src/components/developer-info-section.tsx` | Aggiunti due link "Privacy policy"/"Termini di servizio" (apre `Linking.openURL`), visibili sia lato coach sia lato cliente (componente gia' condiviso). |
| `mobile/src/app/impostazioni.tsx`, `mobile/src/app/cliente-profilo.tsx` | Aggiunta sezione "Zona pericolosa" con pulsante "Elimina account" (doppia conferma, chiama la nuova Edge Function `delete-account`, poi logout). |
| `supabase/functions/delete-account/index.ts` (nuovo) | Edge Function: elimina definitivamente l'account Supabase Auth del chiamante (mai di terzi). Vedi sezione 6. |
| `mobile/src/lib/auth-service.ts` | Aggiunta `deleteOwnAccount()`, che chiama la Edge Function sopra. |

Nessuna modifica alla configurazione Android esistente (`android.package`, `android.permissions`, `eas.json` build.*.android).

## 3. Permessi iOS (Info.plist)

| Chiave | Stato | Motivo |
|---|---|---|
| `NSPhotoLibraryUsageDescription` | Impostata (via plugin `expo-image-picker`, testo italiano gia' esistente) | Selezione foto/video dalla libreria per check-in cliente e video esercizi (`launchImageLibraryAsync`, mai fotocamera). |
| `NSCameraUsageDescription` | **Rimossa** (`cameraPermission: false`) | Nessun punto dell'app chiama `launchCameraAsync` o richiede permessi fotocamera. |
| `NSMicrophoneUsageDescription` | **Lasciata al default generico del plugin (inglese)** — limite noto, vedi sotto | Nessun codice registra audio (`expo-audio` e' usato solo per la riproduzione dei suoni del timer, mai `useAudioRecorder`/registrazione). Il permesso microfono su iOS e' accoppiato, nel plugin `expo-image-picker`, allo stesso flag che su Android aggiunge/rimuove `android.permission.RECORD_AUDIO` — che e' **gia' dichiarato esplicitamente e volutamente lasciato intatto** in `app.json` (`android.permissions`), per non violare la regola "non modificare configurazioni Android esistenti". Impostare `microphonePermission: false` avrebbe rimosso anche il permesso Android in fase di build. **Azione consigliata per Luigi**: verificare se `RECORD_AUDIO` su Android serve ancora a qualcosa di reale; se no, rimuoverlo in un task dedicato Android, dopodiche' si potra' impostare `microphonePermission: false` anche qui e ripulire del tutto la voce iOS. |
| `NSPhotoLibraryAddUsageDescription`, `NSFaceIDUsageDescription`, `NSCalendarsUsageDescription` | Non aggiunte | Nessun salvataggio in libreria foto (`MediaLibrary`), nessuna autenticazione biometrica, nessuna integrazione calendario nel codice. |

`ios.privacyManifests`: non aggiunto. `npx expo-doctor` (20/20 check passati) non ha segnalato API "required reason" mancanti nei pacchetti installati — se EAS Build iOS dovesse in futuro segnalare un manifest privacy mancante, va aggiunto solo a quel punto, con la motivazione reale richiesta da quel pacchetto specifico.

`associatedDomains`: non aggiunto — l'app non usa universal link (nessun link `https://` gestito da `redirect-url.ts`, solo redirect web via `window.location.origin`).

`usesAppleSignIn`: non aggiunto — l'app usa solo autenticazione email/password (nessun Google/Facebook/social login presente da bilanciare con "Accedi con Apple").

## 4. Supabase / autenticazione

- Persistenza sessione: `AsyncStorage` (`mobile/src/lib/supabase.ts`), `autoRefreshToken`/`persistSession: true` — gia' corretto e cross-platform (nessun uso diretto di `localStorage` su nativo).
- `detectSessionInUrl: Platform.OS === 'web'` — su nativo il deep link automatico degli URL Supabase (reset password, magic link) **non e' implementato**: limite pre-esistente, non specifico di iOS, gia' documentato in `docs/EMAIL_SETUP.md`/`docs/BUGS.md`/`docs/TODO_NEXT.md`. Non e' stato risolto in questo task (fuori scope: e' una feature nuova, non una modifica di configurazione iOS).
- L'app usa solo email/password: nessun "Accedi con Apple" da implementare (vedi sopra).

**Da configurare manualmente su Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**: aggiungere `mobile://` (schema nativo dell'app) come prefisso valido, in previsione di un futuro handler di deep link nativo. Ad oggi il flusso di reset password su nativo dipende comunque dalla `Site URL` di progetto (nessun redirect esplicito passato da `requestPasswordReset` su nativo, vedi `redirect-url.ts`).

## 5. RevenueCat iOS

Gia' implementato correttamente, verificato in questo task (nessuna modifica necessaria):

- `mobile/src/lib/revenuecat-service.ts`: `getApiKey()` sceglie `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`/`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` in base a `Platform.OS`.
- `configureRevenueCat()` protegge da doppia chiamata (`configured` flag).
- `appUserID` = id utente Supabase, condiviso tra Android e iOS.
- `openRevenueCatSubscriptionManagement()` usa `customerInfo.managementURL` (fornito da RevenueCat, gia' store-appropriate: App Store su iOS, Google Play su Android) + `Linking.openURL`.
- `supabase/functions/revenuecat-webhook/index.ts`: gia' store-agnostico (nessun controllo che presupponga eventi solo da Google Play; gestisce `android_product_id`/`ios_product_id`).
- Il pulsante "Gestisci abbonamento" (schermate abbonamento) e' gia' condizionato alla presenza di un abbonamento RevenueCat attivo, non compare per pacchetti assegnati manualmente dal superadmin.

**Variabile ambiente da aggiungere** (oltre a quella Android gia' esistente): `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` — chiave pubblica RevenueCat del progetto iOS (RevenueCat Dashboard → Project → API Keys → App Store). Da impostare come EAS secret (`eas secret:create` o variabile di progetto EAS) e in `mobile/.env` locale per lo sviluppo, MAI committata.

## 6. Eliminazione account (nuovo, obbligatorio per App Store 5.1.1(v))

- `supabase/functions/delete-account/index.ts`: elimina **davvero** l'account (`auth.admin.deleteUser`), non lo disattiva ne' fa solo logout. Il target e' sempre e solo il chiamante autenticato (nessun `userId` accettato dal client).
- Cascata dati: `public.profiles.id references auth.users(id) on delete cascade` (vedi `docs/SUPABASE_SCHEMA.sql`) e la quasi totalita' delle tabelle collegate a `profiles` sono `on delete cascade` — l'eliminazione dell'utente auth elimina a cascata profilo, dati coach/cliente, schede, appuntamenti, metriche, ecc. Le uniche due tabelle con `created_by ... on delete restrict` (`client_notes`, `exercise_progress_history`) vengono ripulite esplicitamente dalla Edge Function prima della `deleteUser`, per non dipendere dall'ordine di esecuzione dei trigger FK di Postgres.
- **Limite noto**: non vengono eliminati i file nello Storage (avatar, video esercizi) collegati all'utente — resta un limite da risolvere in un task dedicato (pulizia storage per user id).
- **Limite noto**: l'eliminazione account non annulla automaticamente un abbonamento Apple/Google attivo — l'utente deve comunque disdirlo dalla gestione abbonamenti dello store (Apple/Google non permettono la disdetta programmatica lato server).
- UI: pulsante "Elimina account" in Impostazioni (coach: `impostazioni.tsx`; cliente: `cliente-profilo.tsx`, che e' la reale schermata "Impostazioni" raggiunta dal cliente), doppia conferma, poi logout automatico.
- Il superadmin non puo' eliminarsi da questo flusso (guardia esplicita nella Edge Function): non e' un ruolo end-user esposto in queste schermate.

## 7. Requisiti App Store — checklist

| Requisito | Stato |
|---|---|
| Ripristino acquisti | Gia' presente (RevenueCat `restoreRevenueCatPurchases`). |
| Gestione abbonamento | Gia' presente, store-appropriate (vedi sezione 5). |
| Eliminazione account | **Aggiunta in questo task** (vedi sezione 6). |
| Privacy policy / termini in-app | **Aggiunta in questo task** — link in "Sviluppatore" (Impostazioni), ma puntano a **URL placeholder** (`PRIVACY_POLICY_URL`/`TERMS_OF_SERVICE_URL` in `mobile/src/constants/app-info.ts`): nessun documento reale esiste ancora. **Dato mancante da Luigi**: pubblicare privacy policy e termini di servizio reali su un dominio controllato, poi sostituire i due URL. |
| Schermata versione app | Gia' presente (`DeveloperInfoSection`, `APP_VERSION` da `expo-constants`). |
| Nessun dato demo in produzione | Non modificato in questo task (fuori scope: nessun dato demo trovato hardcoded nei flussi reali durante l'audit). |
| Messaggi di errore comprensibili | Gia' pattern consolidato in tutto il progetto (`AuthServiceResult`/messaggi in italiano). |

## 8. Variabili ambiente richieste (mobile/.env, mai committato)

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=...
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=...        <- NUOVA, da aggiungere
```

Su EAS (build cloud), le stesse variabili vanno configurate come EAS secrets/environment variables di progetto (non lette da `.env` locale in cloud).

## 9. Controlli eseguiti

| Controllo | Esito |
|---|---|
| `npx tsc --noEmit` | Pulito, nessun errore. |
| `npx expo-doctor` | 20/20 check passati. |
| `npx expo config --type public` / `--type prebuild` | Config risolta correttamente, `ios.bundleIdentifier`/`supportsTablet`/`config.usesNonExemptEncryption` presenti come attesi. |
| Lint | Nessuno script di lint configurato nel progetto (`package.json` non ne ha uno) — nulla da eseguire. |
| Test | Nessun test runner configurato nel progetto — nulla da eseguire. |
| Grep codice Android-only (`BackHandler`, `ToastAndroid`, intent Android, `Platform.OS === 'android'` senza branch iOS) | Nessun risultato bloccante: gli unici `Platform.OS === 'android'` trovati (`package-checkout-service.ts`, `revenuecat-service.ts`, `push-notification-service.ts`) hanno tutti un branch `'ios'` o sono generici multipiattaforma. |
| Keyboard/safe area/modali/video fullscreen | `AppScreen` (`keyboardAvoiding` prop) usa gia' `KeyboardAvoidingView behavior="padding"` su tutto il nativo (non solo Android); `useSafeAreaInsets` usato in 30+ file; `fullscreen-video-modal.tsx` gia' safe-area-aware con chiusura accessibile. Nessuna modifica necessaria. |

## 10. Dati che Luigi deve ancora inserire manualmente

1. **Apple Developer Team ID** e iscrizione Apple Developer Program attiva (richiesta per build/submit reali).
2. **App Store Connect**: creare l'app con bundle id `com.fitcoachapp.mobile`, recuperare l'**ASC App ID** e sostituirlo in `mobile/eas.json` → `submit.production.ios.ascAppId` (oggi placeholder `"YOUR_APP_STORE_CONNECT_ASC_APP_ID"`).
3. **RevenueCat Dashboard**: creare/collegare l'app iOS, recuperare la chiave pubblica App Store e impostarla come `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` (EAS secret + `.env` locale).
4. **In-App Purchase su App Store Connect**: creare i prodotti/abbonamenti corrispondenti a `iosProductId` dei pacchetti (`subscription_packages`), se non gia' creati.
5. **Privacy policy e termini di servizio reali**: pubblicarli e sostituire `PRIVACY_POLICY_URL`/`TERMS_OF_SERVICE_URL` in `mobile/src/constants/app-info.ts`. Lo stesso URL privacy va inserito anche in App Store Connect → App Privacy.
6. **App Store Connect → App Privacy**: compilare il questionario privacy (dati raccolti: email, nome, dati di allenamento/metriche corporee, foto opzionali) — non automatizzabile da qui.
7. **Decisione su `android.permission.RECORD_AUDIO`**: verificare se serve ancora; se no, rimuoverlo (task Android dedicato) per poter poi ripulire anche `NSMicrophoneUsageDescription` su iOS (vedi sezione 3).
8. **Apple Push Notification key** (se si vuole push reale su iOS): configurare via `eas credentials` (APNs key, non necessaria per il primo development/TestFlight build senza push).

## 11. Comandi per build/submit iOS

```
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest device:create          # registra il tuo iPhone per le build "development"/"preview" ad-hoc
npx eas-cli@latest build --platform ios --profile development
npx eas-cli@latest build --platform ios --profile preview
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

### Checklist TestFlight

1. `eas device:create` con l'iPhone reale collegato/registrato (UDID).
2. `eas build --platform ios --profile development` → installa sul device (development client, per debug con Metro).
3. Quando l'app e' stabile: `eas build --platform ios --profile production` → build da inviare allo store.
4. `eas submit --platform ios --latest` → carica su App Store Connect (richiede `ascAppId` reale, punto 2 sopra).
5. In App Store Connect → TestFlight: aggiungere tester interni/esterni, compilare le note di test.
6. Verificare su un iPhone reale (non solo simulatore, che comunque non supporta acquisti in-app RevenueCat): login, RevenueCat (acquisto/ripristino), eliminazione account, notch/Dynamic Island, tastiera sui form.
