# Thumbnail esercizi (locali)

Facoltative: se non presenti, la lista esercizi mostra un placeholder grafico (cerchio con iniziale), non un errore. Se vuoi aggiungere una foto reale per un esercizio:

1. Metti qui il file `.jpg`/`.png`, nome minuscolo senza spazi, stesso schema dei video (es. `panca-piana.jpg`).
2. Registra una riga in `mobile/src/data/image-registry.ts`:
   ```ts
   'panca-piana.jpg': require('../../assets/images/exercises/panca-piana.jpg'),
   ```
3. Nessun URL esterno, nessuna immagine scaricata da internet senza diritti chiari: stessa regola dei video (vedi `mobile/assets/videos/README.md` e la skill `exercise-video-production`).

Finché un esercizio non ha una voce nel registro, il thumbnail mostra un placeholder onesto, non un'immagine finta.
