import Svg, { Circle } from 'react-native-svg';
import { StyleSheet, Text, View } from 'react-native';

import { AppFontSize, useAppTheme } from '@/theme';

type AppRingProgressProps = {
  value: number;
  max: number;
  label: string;
  size?: number;
  strokeWidth?: number;
};

// Anello di progresso (RingProgress nel mockup): mostra "completati/totale"
// (non il solo numeratore come nel mockup, per restare onesti sul totale
// reale acquistato dal cliente, che varia per pacchetto — non è fisso a 12
// come nella demo). Nessuna dipendenza nuova: usa react-native-svg, già
// installato per le icone lucide-react-native.
export function AppRingProgress({ value, max, label, size = 160, strokeWidth = 13 }: AppRingProgressProps) {
  const { colors } = useAppTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0.03, Math.min(1, value / safeMax));
  const dash = circumference * pct;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.surfaceSubtle} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.moss}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text style={[styles.value, { color: colors.ink }]}>
          {value}/{max}
        </Text>
        <Text style={[styles.label, { color: colors.inkSoft }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  svg: {
    transform: [{ rotate: '-90deg' }],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: AppFontSize.xs,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.5,
  },
});
