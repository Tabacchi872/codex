import { memo, useMemo } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { getMuscleAccessibilityLabel, MUSCLE_LABELS, resolveExerciseMuscles } from '@/lib/muscle-map';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { AnatomicalMuscleId, Exercise } from '@/types/training';

type MuscleMapProps = {
  exercise?: Exercise;
  primaryMuscles?: AnatomicalMuscleId[];
  secondaryMuscles?: AnatomicalMuscleId[];
  compact?: boolean;
  showLabels?: boolean;
  orientation?: 'both' | 'front' | 'back';
  style?: StyleProp<ViewStyle>;
};

type ResolvedMuscles = { primary: AnatomicalMuscleId[]; secondary: AnatomicalMuscleId[] };
export type MuscleKey = AnatomicalMuscleId;

type MuscleLayer = {
  id: AnatomicalMuscleId;
  d: string;
};

const BODY_BASE = require('../../assets/muscles/anatomy-fitness-body.png');
const BODY_LINES = require('../../assets/muscles/anatomy-fitness-lines.png');

const MUSCLE_LAYERS: MuscleLayer[] = [
  { id: 'side_deltoids', d: 'M68 99 C78 83 101 87 111 103 C100 119 82 128 64 123 C60 113 62 105 68 99 Z' },
  { id: 'side_deltoids', d: 'M154 103 C164 87 187 83 197 99 C203 105 205 113 201 123 C183 128 165 119 154 103 Z' },
  { id: 'front_deltoids', d: 'M80 100 C90 91 105 94 111 106 C105 119 92 126 78 123 C73 114 74 106 80 100 Z' },
  { id: 'front_deltoids', d: 'M154 106 C160 94 175 91 185 100 C191 106 192 114 187 123 C173 126 160 119 154 106 Z' },
  { id: 'upper_chest', d: 'M102 92 C116 86 149 86 163 92 C154 101 142 106 132 106 C122 106 111 101 102 92 Z' },
  { id: 'chest', d: 'M94 105 C108 94 127 98 132 116 C128 131 116 140 98 135 C89 126 87 114 94 105 Z' },
  { id: 'chest', d: 'M134 116 C139 98 158 94 172 105 C179 114 177 126 168 135 C150 140 138 131 134 116 Z' },
  { id: 'biceps', d: 'M65 132 C78 131 87 145 81 167 C77 184 70 199 60 214 C51 212 47 203 51 191 C55 167 58 144 65 132 Z' },
  { id: 'biceps', d: 'M201 132 C208 144 211 167 215 191 C219 203 215 212 206 214 C196 199 189 184 185 167 C179 145 188 131 201 132 Z' },
  { id: 'forearms', d: 'M57 211 C68 214 74 222 72 233 C67 244 53 248 44 237 C44 224 49 216 57 211 Z' },
  { id: 'forearms', d: 'M209 211 C217 216 222 224 222 237 C213 248 199 244 194 233 C192 222 198 214 209 211 Z' },
  { id: 'abs', d: 'M113 142 C119 138 128 138 133 142 L132 159 C124 163 116 163 109 159 Z' },
  { id: 'abs', d: 'M135 142 C140 138 149 138 155 142 L159 159 C152 163 144 163 136 159 Z' },
  { id: 'abs', d: 'M109 164 C117 161 126 161 133 164 L131 181 C123 185 114 184 106 180 Z' },
  { id: 'abs', d: 'M136 164 C143 161 152 161 160 164 L163 180 C155 184 146 185 138 181 Z' },
  { id: 'abs', d: 'M106 187 C115 184 124 184 132 187 L129 205 C120 209 111 207 103 201 Z' },
  { id: 'abs', d: 'M139 187 C147 184 156 184 165 187 L168 201 C160 207 151 209 142 205 Z' },
  { id: 'obliques', d: 'M100 141 C109 139 113 150 110 166 L102 202 C92 193 90 167 100 141 Z' },
  { id: 'obliques', d: 'M173 141 C183 167 181 193 171 202 L163 166 C160 150 164 139 173 141 Z' },
  { id: 'hip_flexors', d: 'M99 210 C111 216 123 219 133 220 C129 235 119 245 103 249 C95 239 94 223 99 210 Z' },
  { id: 'hip_flexors', d: 'M138 220 C148 219 160 216 172 210 C177 223 176 239 168 249 C152 245 142 235 138 220 Z' },
  { id: 'adductors', d: 'M122 236 C131 241 135 255 134 273 L127 331 C118 321 115 291 118 263 Z' },
  { id: 'adductors', d: 'M150 236 L154 263 C157 291 154 321 145 331 L138 273 C137 255 141 241 150 236 Z' },
  { id: 'quadriceps', d: 'M88 237 C101 247 116 253 132 256 C128 285 123 315 116 339 C101 343 90 331 86 313 C80 280 80 253 88 237 Z' },
  { id: 'quadriceps', d: 'M140 256 C156 253 171 247 184 237 C192 253 192 280 186 313 C182 331 171 343 156 339 C149 315 144 285 140 256 Z' },
  { id: 'calves', d: 'M87 340 C100 350 113 349 120 337 C120 357 117 378 112 394 C101 403 88 399 82 386 C81 368 83 354 87 340 Z' },
  { id: 'calves', d: 'M156 337 C163 349 176 350 189 340 C193 354 195 368 194 386 C188 399 175 403 164 394 C159 378 156 357 156 337 Z' },

  { id: 'traps', d: 'M298 82 C306 77 319 82 328 93 C337 82 350 77 358 82 C354 99 343 113 328 122 C313 113 302 99 298 82 Z' },
  { id: 'rear_deltoids', d: 'M276 101 C289 86 310 91 320 109 C310 125 291 135 273 130 C268 117 270 108 276 101 Z' },
  { id: 'rear_deltoids', d: 'M336 109 C346 91 367 86 380 101 C386 108 388 117 383 130 C365 135 346 125 336 109 Z' },
  { id: 'upper_back', d: 'M298 105 C311 109 321 118 328 129 C321 148 310 162 296 171 C287 153 287 124 298 105 Z' },
  { id: 'upper_back', d: 'M330 129 C337 118 347 109 360 105 C371 124 371 153 362 171 C348 162 337 148 330 129 Z' },
  { id: 'lats', d: 'M292 140 C309 151 320 169 323 190 L313 228 C297 220 286 200 281 176 C278 158 282 147 292 140 Z' },
  { id: 'lats', d: 'M364 140 C374 147 378 158 375 176 C370 200 359 220 343 228 L333 190 C336 169 347 151 364 140 Z' },
  { id: 'lower_back', d: 'M307 197 C317 191 339 191 349 197 L359 226 C346 237 310 237 297 226 Z' },
  { id: 'triceps', d: 'M277 135 C289 133 297 148 292 170 C288 191 280 209 270 226 C261 224 257 214 261 202 C265 174 269 149 277 135 Z' },
  { id: 'triceps', d: 'M380 135 C388 149 392 174 396 202 C400 214 396 224 387 226 C377 209 369 191 365 170 C360 148 368 133 380 135 Z' },
  { id: 'forearms', d: 'M268 224 C279 227 285 235 283 247 C278 258 264 262 255 250 C255 238 260 229 268 224 Z' },
  { id: 'forearms', d: 'M389 224 C397 229 402 238 402 250 C393 262 379 258 374 247 C372 235 378 227 389 224 Z' },
  { id: 'glutes', d: 'M300 235 C314 226 337 228 328 256 C325 276 310 291 290 292 C280 280 281 250 300 235 Z' },
  { id: 'glutes', d: 'M328 256 C319 228 342 226 356 235 C375 250 376 280 366 292 C346 291 331 276 328 256 Z' },
  { id: 'abductors', d: 'M286 255 C293 269 296 293 294 317 C292 331 287 341 280 345 C275 311 276 276 286 255 Z' },
  { id: 'abductors', d: 'M371 255 C381 276 382 311 377 345 C370 341 365 331 363 317 C361 293 364 269 371 255 Z' },
  { id: 'hamstrings', d: 'M298 279 C311 284 324 281 331 274 C327 306 322 335 315 350 C301 354 290 342 287 324 C284 304 287 289 298 279 Z' },
  { id: 'hamstrings', d: 'M334 274 C341 281 354 284 367 279 C378 289 381 304 378 324 C375 342 364 354 350 350 C343 335 338 306 334 274 Z' },
  { id: 'calves', d: 'M292 351 C305 361 318 360 325 348 C325 367 322 384 317 397 C306 406 293 402 287 389 C286 374 288 362 292 351 Z' },
  { id: 'calves', d: 'M331 348 C338 360 351 361 364 351 C368 362 370 374 369 389 C363 402 350 406 339 397 C334 384 331 367 331 348 Z' },
];

export const MuscleMapView = memo(function MuscleMapView({
  exercise,
  primaryMuscles,
  secondaryMuscles,
  compact,
  showLabels = true,
  style,
}: MuscleMapProps) {
  const { colors } = useAppTheme();
  const resolved = useMemo<ResolvedMuscles>(() => {
    if (exercise) return resolveExerciseMuscles(exercise);
    return {
      primary: uniqueMuscles(primaryMuscles ?? []),
      secondary: uniqueMuscles(secondaryMuscles ?? []).filter((muscle) => !(primaryMuscles ?? []).includes(muscle)),
    };
  }, [exercise, primaryMuscles, secondaryMuscles]);
  const empty = resolved.primary.length === 0 && resolved.secondary.length === 0;
  const accessibilityLabel = getMuscleAccessibilityLabel(resolved);

  return (
    <View
      style={[styles.card, { backgroundColor: '#141716', borderColor: '#26312B' }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.ink }]}>Muscoli Coinvolti</Text>
          <Text style={[styles.subtitle, { color: colors.inkSoft }]} numberOfLines={2}>
            {summaryLine(resolved)}
          </Text>
        </View>
        <View style={styles.legend}>
          <LegendDot color={colors.moss} label="Principale" />
          <LegendDot color="#5F8F37" label="Secondario" />
        </View>
      </View>

      {empty ? (
        <Text style={[styles.emptyText, { color: colors.inkSoft }]}>Mappa muscolare non disponibile</Text>
      ) : (
        <>
          <View style={[styles.referenceFrame, compact && styles.referenceFrameCompact]}>
            <Image source={BODY_BASE} style={styles.anatomyLayer} contentFit="contain" />
            <Svg pointerEvents="none" style={styles.anatomyLayer} viewBox="0 0 450 407" preserveAspectRatio="xMidYMid meet">
              <G>{MUSCLE_LAYERS.map((layer, index) => <ActiveMusclePath key={`${layer.id}-${index}`} layer={layer} muscles={resolved} />)}</G>
            </Svg>
            <Image source={BODY_LINES} style={styles.anatomyLayer} contentFit="contain" />
          </View>
          {showLabels ? <MuscleTextList muscles={resolved} /> : null}
        </>
      )}
    </View>
  );
});

export const MuscleMap = MuscleMapView;

function ActiveMusclePath({ layer, muscles }: { layer: MuscleLayer; muscles: ResolvedMuscles }) {
  const { colors } = useAppTheme();
  const fullBody = muscles.primary.includes('full_body');
  if (fullBody || muscles.primary.includes(layer.id)) {
    return <Path d={layer.d} fill={colors.moss} opacity={0.86} />;
  }
  if (muscles.secondary.includes(layer.id)) {
    return <Path d={layer.d} fill="#5F8F37" opacity={0.72} />;
  }
  return null;
}

function MuscleTextList({ muscles }: { muscles: ResolvedMuscles }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.textList}>
      <MuscleGroupList title="Muscoli principali" muscles={muscles.primary} color={colors.moss} />
      {muscles.secondary.length > 0 ? <MuscleGroupList title="Muscoli secondari" muscles={muscles.secondary} color={colors.inkSoft} /> : null}
    </View>
  );
}

function MuscleGroupList({ title, muscles, color }: { title: string; muscles: AnatomicalMuscleId[]; color: string }) {
  const { colors } = useAppTheme();
  if (muscles.length === 0) return null;
  return (
    <View style={styles.groupList}>
      <Text style={[styles.groupTitle, { color }]}>{title}</Text>
      <View style={styles.chips}>
        {muscles.map((muscle) => (
          <View key={muscle} style={[styles.chip, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
            <Text style={[styles.chipText, { color: colors.ink }]}>{MUSCLE_LABELS[muscle]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color, borderColor: colors.border }]} />
      <Text style={[styles.legendText, { color: colors.inkSoft }]}>{label}</Text>
    </View>
  );
}

function uniqueMuscles(muscles: AnatomicalMuscleId[]) {
  return Array.from(new Set(muscles));
}

function summaryLine(muscles: ResolvedMuscles) {
  const merged = [...muscles.primary, ...muscles.secondary];
  if (merged.length === 0) return 'Muscoli coinvolti non ancora classificati.';
  return merged.map((muscle) => MUSCLE_LABELS[muscle]).join(', ');
}

const styles = StyleSheet.create({
  card: {
    borderRadius: AppRadius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: AppSpacing[3],
    overflow: 'hidden',
    padding: AppSpacing[3],
  },
  header: {
    gap: AppSpacing[2],
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 24,
  },
  subtitle: {
    fontSize: AppFontSize.sm + 1,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 6,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  legendDot: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 10,
    width: 10,
  },
  legendText: {
    fontSize: AppFontSize.xs,
    fontWeight: '700',
  },
  referenceFrame: {
    aspectRatio: 450 / 407,
    backgroundColor: '#0D100F',
    borderRadius: AppRadius.lg,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  referenceFrameCompact: {
    maxHeight: 244,
  },
  anatomyLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  textList: {
    gap: AppSpacing[2],
  },
  groupList: {
    gap: AppSpacing[1],
  },
  groupTitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderRadius: AppRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: AppFontSize.xs,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    lineHeight: 19,
  },
});
