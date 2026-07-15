# Video guida esercizi (locali)

Metti qui i file video degli esercizi, in formato `.mp4`, nome minuscolo senza spazi (es. `panca-piana.mp4`).

Metro (il bundler di Expo) richiede `require()` statici: non basta copiare il file in questa cartella perché venga usato. Dopo aver aggiunto un file:

1. Aggiungi una riga al registro in `mobile/src/data/video-registry.ts`, es.:
   ```ts
   'panca-piana.mp4': require('../../assets/videos/panca-piana.mp4'),
   ```
2. Verifica che `videoFile` dell'esercizio corrispondente in `mobile/src/data/exercise-library.ts` combaci esattamente con la chiave usata nel registro.

Finché un esercizio non ha una voce nel registro, `ExerciseVideoPlayer` mostra correttamente "Video locale mancante" invece di un errore o di un video finto.
