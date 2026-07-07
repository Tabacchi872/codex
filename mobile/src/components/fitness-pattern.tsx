import { StyleSheet, View, type DimensionValue } from 'react-native';

// Pattern grafico leggerissimo (manubri e cerchi), non un'immagine: evita i
// problemi di tiling delle immagini tra iOS/Android/Web e resta leggero (nessun
// asset da caricare). Pensato per essere quasi impercettibile: la funzione di
// chi lo usa (ScreenBackground) è applicare colore/opacità molto bassi.
const DUMBBELLS = [
  { top: '6%', left: '-8%', size: 130, rotate: '-18deg' },
  { top: '68%', left: '70%', size: 160, rotate: '24deg' },
  { top: '32%', left: '58%', size: 90, rotate: '-8deg' },
] as const;

const CIRCLES = [
  { top: '80%', left: '5%', size: 100 },
  { top: '10%', left: '75%', size: 70 },
] as const;

export function FitnessPattern({ color }: { color: string }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {DUMBBELLS.map((d, index) => (
        <Dumbbell key={`dumbbell-${index}`} color={color} {...d} />
      ))}
      {CIRCLES.map((c, index) => (
        <View
          key={`circle-${index}`}
          style={{
            position: 'absolute',
            top: c.top,
            left: c.left,
            width: c.size,
            height: c.size,
            borderRadius: c.size / 2,
            borderWidth: c.size * 0.06,
            borderColor: color,
          }}
        />
      ))}
    </View>
  );
}

function Dumbbell({
  color,
  top,
  left,
  size,
  rotate,
}: {
  color: string;
  top: DimensionValue;
  left: DimensionValue;
  size: number;
  rotate: string;
}) {
  const plateSize = size * 0.34;
  const barHeight = size * 0.1;

  return (
    <View style={{ position: 'absolute', top, left, transform: [{ rotate }] }}>
      <View style={[styles.dumbbellRow, { width: size }]}>
        <View style={{ width: plateSize, height: plateSize, borderRadius: plateSize * 0.28, backgroundColor: color }} />
        <View style={{ flex: 1, height: barHeight, backgroundColor: color }} />
        <View style={{ width: plateSize, height: plateSize, borderRadius: plateSize * 0.28, backgroundColor: color }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dumbbellRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
