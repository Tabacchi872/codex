# FitCoach Pro — revisione stile schede ed esercizi

## Problemi trovati

- Due design system paralleli (`constants/theme` e `theme`) con colori, raggi e tipografia non coerenti.
- Titoli troppo grandi/pesanti e contenitori flex senza protezioni sufficienti, con parole spezzate e card sbilanciate.
- Home cliente con decorazioni geometriche invasive e hero senza un'immagine esercizio stabile.
- Dettaglio scheda con titolo usato anche nell'header, hero troppo stretta e conteggio esercizi visivamente scollegato.
- Liste schede cliente/coach e modelli prive di una gerarchia comune per thumbnail, stato e metadati.
- Righe esercizio cliccabili contenenti altri controlli interattivi, causa del warning web sui button annidati.
- Picker YMove e logger esercizio poco responsive sotto 360–390 px.
- Tab attiva superadmin non allineata al verde lime usato negli altri ruoli.

## Interventi principali

- Allineati i token legacy al tema dark premium FitCoach Pro, mantenendo le chiavi esistenti.
- Ridotta e normalizzata la scala tipografica condivisa.
- `Card` mantenuta come contenitore solo visivo; le azioni sono Pressable/AppButton separati.
- Home cliente: progresso più pulito, hero del prossimo allenamento con thumbnail/placeholder stabile e layout responsive.
- Schede cliente e coach: card uniformi, immagini, badge, metadati e titoli con limite righe.
- Dettaglio scheda: BackHeader generico, hero responsive, conteggio integrato, date formattate e azioni coerenti.
- Modelli scheda: lista e dettaglio completamente riallineati allo stesso stile.
- Esercizi: libreria, dettaglio, righe, editor, serie, storico, allegati, timer e YMove resi coerenti e responsive.
- Superadmin: tab attiva verde lime; nessuna modifica ai flussi dati.

## Test eseguiti

- `npx tsc --noEmit`: superato.
- Audit AST dei componenti interattivi annidati: nessun caso trovato.
- `expo-doctor`: i controlli locali passano; i controlli che richiedono rete non sono verificabili nell'ambiente isolato.
- Export Metro e test APK/dispositivo: da rieseguire sul PC con rete e ambiente Expo completo.

## Verifica obbligatoria nel nuovo APK

1. Home cliente a 320/360/393/412 px.
2. Workout: Da fare, Completati e Saltati.
3. Dettaglio scheda, avvio sessione, lista esercizi e completamento.
4. Dettaglio esercizio: immagine/video, serie, recupero, storico e allegati.
5. Coach: lista schede, nuova/modifica scheda, modelli e libreria YMove.
6. Navigazione BackHeader e tab bar per cliente, coach e superadmin.
7. Tema Chiaro, Scuro e Sistema.
8. Web: console priva di warning `nested button` e hydration.
