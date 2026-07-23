# Configurazione Client Pro (abbonamento clienti self_guided)

Questa guida documenta esattamente cosa Luigi deve configurare fuori dal
codice per attivare l'abbonamento **Client Pro** per i clienti `self_guided`
(clienti FitCoach senza coach). Il codice lato app/webhook e' gia' pronto e
generico: **nessuna riga qui sotto richiede una nuova migration o una
modifica di codice**, solo configurazione nelle dashboard esterne e nel
pannello superadmin dell'app.

Nessun segreto/chiave reale e' scritto in questo file.

## ATTENZIONE — azione richiesta anche lato pacchetti coach (non solo Client Pro)

`mobile/src/lib/revenuecat-service.ts` risolve ora l'Offering di un pacchetto
in modo **esplicito e case-sensitive**, leggendo SEMPRE e SOLO
`subscription_packages.revenuecat_offering_id` del pacchetto (`offerings.all[revenuecat_offering_id]`)
— mai `offerings.current` (la Default Offering RevenueCat, che resta
`Fitcoach` e non va toccata in dashboard), mai un'altra Offering come
fallback. Se l'Offering configurata non esiste, l'app mostra un errore di
configurazione chiaro invece di usare quella dell'altro ruolo.

**Prima di questo cambiamento il flusso coach poteva funzionare anche con
`revenuecat_offering_id` vuoto**, appoggiandosi implicitamente alla Default
Offering (`offerings.current`) di RevenueCat. Con la rimozione di quel
fallback, **verifica che ogni pacchetto coach attivo nel pannello superadmin
(`/superadmin/pacchetti`, tab "Pacchetti coach") abbia il campo "Offering"
impostato esattamente a `Fitcoach`** (maiuscola iniziale, case-sensitive) —
altrimenti la paywall coach mostrera' "Offering RevenueCat non trovata"
anche se l'acquisto funzionava prima di questa modifica. Stesso controllo
per i pacchetti client: campo "Offering" impostato esattamente a
`client_plans`.

## Contratto (identico a quanto richiesto, nessun identificativo inventato senza necessita')

- Entitlement RevenueCat: `client_pro`
- Offering RevenueCat: `client_plans`
- Package RevenueCat: `MONTHLY`, `THREE_MONTH`, `ANNUAL`
- Tutte e tre le durate sbloccano lo stesso accesso Client Pro (nessun
  livello Basic/Premium separato).

## 1. Google Play Console

1. Crea un **subscription product** con id `client_pro` (app FitCoach Pro,
   package Android gia' esistente).
2. Crea **3 base plan** sotto quel prodotto, con questi id esatti (scelti in
   questo lavoro perche' Google Play li richiede e non esistevano prima —
   usa esattamente questi per far coincidere la configurazione Supabase
   sotto):
   - `monthly` — rinnovo automatico, 1 mese
   - `quarterly` — rinnovo automatico, 3 mesi
   - `annual` — rinnovo automatico, 12 mesi
3. Prezzi iniziali (indicativi, modificabili in Play Console in ogni momento
   senza toccare il codice): Mensile 9,99 EUR, Trimestrale 24,99 EUR,
   Annuale 79,99 EUR.
4. Paesi: gli stessi gia' abilitati per gli altri prodotti FitCoach (o tutti
   i paesi supportati, a discrezione).
5. Periodo di tolleranza (grace period): consigliato 3-7 giorni, coerente
   con quanto gia' impostato per il pacchetto coach, se presente.
6. Aggiungi un **licence test account** (il tuo account Google di test) per
   poter acquistare senza addebito reale.
7. Porta ciascun base plan allo stato **Attivo** — RevenueCat non puo'
   importare un prodotto non attivo.
8. **Nota tecnica per il passaggio 3 (Supabase)**: RevenueCat espone il
   product id Android nel formato `<productId>:<basePlanId>`. Con gli id
   sopra, i product id da inserire in Supabase saranno:
   - `client_pro:monthly`
   - `client_pro:quarterly`
   - `client_pro:annual`

## 2. App Store Connect

1. Crea un **Subscription Group** chiamato `FitCoach Client Pro` (app
   FitCoach Pro, bundle id gia' esistente `com.fitcoachapp.mobile`).
2. Crea 3 prodotti auto-rinnovabili in quel gruppo, con i product id
   esatti gia' indicati nel task (nessuna variazione):
   - `com.fitcoachapp.mobile.client.monthly` — durata 1 mese
   - `com.fitcoachapp.mobile.client.quarterly` — durata 3 mesi
   - `com.fitcoachapp.mobile.client.annual` — durata 1 anno
3. Prezzo iniziale: stesso schema indicativo (9,99 / 24,99 / 79,99 EUR),
   assegna il price tier equivalente in App Store Connect.
4. Localizzazione italiana obbligatoria per ciascun prodotto: nome
   visualizzato e descrizione (puoi riusare i testi della paywall app:
   titolo "Allenati in autonomia con FitCoach", benefici della modalita'
   autonoma).
5. Informazioni per App Review: screenshot della paywall (schermata
   `abbonamento-cliente.tsx`, sezione "Scegli il tuo piano"), nota che
   spiega che i tre prodotti sbloccano lo stesso accesso "Client Pro" con
   durate diverse.
6. Aggiungi un **sandbox tester** (App Store Connect > Utenti e accessi >
   Sandbox Testers) per testare l'acquisto senza addebito reale.
7. Porta lo stato dei prodotti a **Pronto per l'invio**/Approvato prima di
   collegarli a RevenueCat (RevenueCat puo' comunque importarli anche in
   stato "In attesa di revisione", ma il test reale in sandbox richiede la
   build collegata).

## 3. RevenueCat Dashboard

1. **Importa i 6 prodotti** (3 Android + 3 iOS) nel progetto RevenueCat
   gia' usato per il pacchetto coach (stesso progetto, un solo SDK/app
   collegata).
2. **Entitlement**: crea (o riusa se gia' presente da un tentativo
   precedente) l'entitlement `client_pro`, e collega **tutti e sei** i
   prodotti (3 Android + 3 iOS) a questo entitlement — questo e' cio' che fa
   si' che qualunque delle tre durate sblocchi lo stesso accesso.
3. **Offering**: crea l'offering `client_plans` con 3 package:
   - package `MONTHLY` → prodotto Android `client_pro:monthly` + prodotto
     iOS `com.fitcoachapp.mobile.client.monthly`
   - package `THREE_MONTH` → `client_pro:quarterly` +
     `com.fitcoachapp.mobile.client.quarterly`
   - package `ANNUAL` → `client_pro:annual` +
     `com.fitcoachapp.mobile.client.annual`
4. Imposta `client_plans` come offering **corrente/default** (o quantomeno
   raggiungibile: l'app cerca prima l'offering esplicito indicato dal
   pacchetto Supabase — vedi sezione 4 — poi l'offering "current" come
   fallback).
5. **Chiavi SDK**: le stesse chiavi pubbliche Android/iOS gia' usate per il
   pacchetto coach (`EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`/
   `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, gia' configurate in `mobile/.env`)
   restano invariate: un solo progetto RevenueCat multi-prodotto, nessuna
   nuova chiave da generare.
6. **Webhook**: nessuna nuova Edge Function — l'endpoint webhook gia'
   configurato per il pacchetto coach (`supabase/functions/
   revenuecat-webhook`) gestisce anche i prodotti Client Pro (il filtro che
   lo impediva e' stato rimosso in questo lavoro). Verifica solo che
   l'evento venga inviato per il progetto/app corretto.
7. **Test sandbox**: dal pannello RevenueCat > Customers, cerca l'utente di
   test (il suo `app_user_id` corrisponde all'UUID Supabase del cliente
   self_guided di test) dopo un acquisto sandbox e verifica che
   l'entitlement `client_pro` risulti attivo.

## 4. Pannello superadmin FitCoach (`/superadmin/pacchetti`, azione interna)

Nessuna dashboard esterna: crea i 3 pacchetti direttamente dal pannello
superadmin gia' esistente nell'app (form "Nuovo pacchetto"), con questi
valori esatti:

| Campo | Mensile | Trimestrale | Annuale |
|---|---|---|---|
| target_role | client | client | client |
| Nome | Client Pro Mensile | Client Pro Trimestrale | Client Pro Annuale |
| Descrizione | Accesso Client Pro con rinnovo mensile. | Accesso Client Pro con rinnovo trimestrale. | Accesso Client Pro con rinnovo annuale. |
| Prezzo (solo indicativo/amministrativo, MAI usato dalla UI mobile) | 9.99 | 24.99 | 79.99 |
| Valuta | EUR | EUR | EUR |
| Durata | 1 mese | 3 mesi | 12 mesi |
| Limite clienti | (vuoto — solo per pacchetti coach) | (vuoto) | (vuoto) |
| Features | vedi elenco sotto | idem | idem |
| revenuecat_entitlement_id | `client_pro` | `client_pro` | `client_pro` |
| revenuecat_offering_id | `client_plans` | `client_plans` | `client_plans` |
| android_product_id | `client_pro:monthly` | `client_pro:quarterly` | `client_pro:annual` |
| ios_product_id | `com.fitcoachapp.mobile.client.monthly` | `com.fitcoachapp.mobile.client.quarterly` | `com.fitcoachapp.mobile.client.annual` |
| Attivo | si | si | si |
| Ordinamento | 1 | 2 | 3 |

Features suggerite (identiche per le tre durate, riflettono solo funzioni
gia' disponibili in modalita' autonoma — vedi `abbonamento-cliente.tsx`):
- Allenamenti e strumenti della modalita autonoma
- Storico dei carichi e dei progressi
- Metriche e grafici
- Contenuti nutrizionali disponibili
- Video e dettagli degli esercizi

**Importante**: il prezzo inserito qui e' solo un riferimento
amministrativo — l'app mostra sempre il prezzo reale restituito da
RevenueCat/Store (`storeProduct.priceString`), mai questo valore. Se i
prezzi reali configurati negli store differiscono da 9,99/24,99/79,99, la UI
mostrera' comunque il valore corretto senza bisogno di modificare questa
tabella.

## Ordine di configurazione consigliato

1. Google Play + App Store Connect (prodotti in stato attivo/pronto).
2. RevenueCat (import prodotti, entitlement, offering).
3. Pannello superadmin FitCoach (crea i 3 pacchetti con i valori sopra).
4. Test sandbox Android e iOS (acquisto, restore, cambio durata,
   cancellazione) con account di test, mai con account reali.

## Cosa NON fare

- Non modificare le dashboard Google Play/App Store Connect/RevenueCat da
  qui: questa guida documenta solo cosa configurare manualmente.
- Non riattivare il vecchio sistema di "abbonamento cliente" locale
  (contatore workout gestito manualmente dal coach, rimosso nel commit
  `ee55865` — sistema diverso, non correlato a Client Pro).
- Non usare il prezzo di `subscription_packages` come fonte per completare
  un acquisto: e' solo descrittivo.
