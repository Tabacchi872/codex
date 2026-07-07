import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { PlaceholderBanner } from '@/components/placeholder-banner';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { generateAvailableSlots, groupSlotsByDate } from '@/lib/booking-slots';
import { formatDayMonth, formatWeekday } from '@/lib/format-date';
import { useAuthStore } from '@/store/auth-store';
import { useBookingStore } from '@/store/booking-store';
import type { Booking } from '@/types/booking';

// Prenotazioni sedute extra. Logica locale (nessun backend): uno slot preso da
// QUALSIASI cliente su questo store risulta occupato per tutti (vedi
// lib/booking-slots.ts) — coerente con "non deve essere disponibile per altri
// clienti nello stesso orario" anche senza sincronizzazione multi-dispositivo.
export default function PrenotazioniScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const bookings = useBookingStore((s) => s.bookings);
  const addBooking = useBookingStore((s) => s.addBooking);
  const cancelBooking = useBookingStore((s) => s.cancelBooking);
  const hasHydrated = useBookingStore((s) => s.hasHydrated);
  const [selected, setSelected] = useState<{ date: string; time: string } | null>(null);

  const myBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.clientId === currentClientId && b.status === 'confermata')
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [bookings, currentClientId]
  );

  const slotGroups = useMemo(() => groupSlotsByDate(generateAvailableSlots(bookings)), [bookings]);

  function handleConfirm() {
    if (!selected || !currentClientId) return;
    const booking: Booking = {
      id: `booking-${Date.now()}`,
      clientId: currentClientId,
      date: selected.date,
      time: selected.time,
      type: 'Seduta extra',
      status: 'confermata',
      createdAt: new Date().toISOString(),
    };
    addBooking(booking);
    setSelected(null);
  }

  if (!hasHydrated) {
    return (
      <ScreenBackground>
        <View style={styles.loading}>
          <ThemedText type="default" themeColor="textSecondary">
            Caricamento…
          </ThemedText>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three, paddingBottom: Spacing.six },
        ]}>
        <ThemedText type="title" style={styles.title}>
          Prenotazioni
        </ThemedText>

        <ThemedText type="smallBold" style={styles.sectionLabel}>
          LE TUE PROSSIME PRENOTAZIONI
        </ThemedText>
        {myBookings.length === 0 ? (
          <PlaceholderBanner text="Nessuna prenotazione attiva." />
        ) : (
          myBookings.map((b) => (
            <Card key={b.id} style={styles.bookingRow}>
              <View>
                <ThemedText type="smallBold">
                  {formatWeekday(b.date)} · {formatDayMonth(b.date)} · {b.time}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {b.type}
                </ThemedText>
              </View>
              <Pressable onPress={() => cancelBooking(b.id)}>
                <ThemedText type="small" themeColor="statusExpired">
                  Annulla
                </ThemedText>
              </Pressable>
            </Card>
          ))
        )}

        <ThemedText type="smallBold" style={styles.sectionLabel}>
          PRENOTA UNA SEDUTA EXTRA
        </ThemedText>
        {slotGroups.map((group) => (
          <View key={group.date} style={styles.dayGroup}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatWeekday(group.date)} · {formatDayMonth(group.date)}
            </ThemedText>
            <View style={styles.slotsRow}>
              {group.slots.map((slot) => {
                const isSelected = selected?.date === slot.date && selected.time === slot.time;
                return (
                  <Pressable
                    key={slot.time}
                    disabled={!slot.available}
                    onPress={() => setSelected({ date: slot.date, time: slot.time })}>
                    <View
                      style={[
                        styles.slotChip,
                        {
                          borderColor: isSelected ? theme.primary : theme.border,
                          backgroundColor: isSelected ? theme.primary : slot.available ? theme.backgroundElement : theme.background,
                        },
                        !slot.available && styles.slotDisabled,
                      ]}>
                      <ThemedText
                        type="small"
                        themeColor={isSelected ? 'onPrimary' : slot.available ? 'text' : 'disabled'}>
                        {slot.time}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {selected && (
          <Pressable onPress={handleConfirm}>
            <View style={[styles.confirmButton, { backgroundColor: theme.primary }]}>
              <ThemedText type="smallBold" themeColor="onPrimary">
                Conferma {formatDayMonth(selected.date)} alle {selected.time}
              </ThemedText>
            </View>
          </Pressable>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  sectionLabel: {
    marginTop: Spacing.three,
    letterSpacing: 0.4,
  },
  bookingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayGroup: {
    gap: 6,
    marginBottom: Spacing.two,
  },
  slotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotChip: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  slotDisabled: {
    opacity: 0.4,
  },
  confirmButton: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
