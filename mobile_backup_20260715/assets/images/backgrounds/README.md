# Sfondi (locali, opzionali)

Lo sfondo attuale dell'app **non usa un'immagine**: è un pattern grafico generato via componente (`mobile/src/components/fitness-pattern.tsx`, poche forme semplici in stile fitness — manubri, cerchi — disegnate con `View`, opacità 4-8%). Questa scelta evita i problemi di affidabilità delle immagini "a piastrelle" (tiling) tra iOS/Android/Web e non richiede nessun asset da mantenere.

Se in futuro si vuole sostituire il pattern con un'immagine reale:

1. Metti qui il file (`.png`/`.jpg`), leggero (poche decine di KB), pensato per essere ripetuto o steso a piena pagina con opacità molto bassa.
2. Aggiorna `mobile/src/components/screen-background.tsx` per usare `ImageBackground`/`Image` invece di (o insieme a) `FitnessPattern`.
3. Stessa regola dei video/foto esercizi: nessuna immagine scaricata da internet senza diritti chiari.

Finché questa cartella resta vuota, `ScreenBackground` usa solo il pattern grafico interno.
