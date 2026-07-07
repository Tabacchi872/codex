import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { Pill } from '@/components/pill';
import { PlaceholderBanner } from '@/components/placeholder-banner';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatDayMonth } from '@/lib/format-date';
import { useAuthStore } from '@/store/auth-store';
import { useBoardStore } from '@/store/board-store';
import type { BoardPost } from '@/types/board';

export default function BachecaScreen() {
  const insets = useSafeAreaInsets();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const posts = useBoardStore((s) => s.posts);
  const hasHydrated = useBoardStore((s) => s.hasHydrated);

  const globalPosts = useMemo(
    () => posts.filter((p) => p.scope === 'globale').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [posts]
  );
  const personalPosts = useMemo(
    () =>
      posts
        .filter((p) => p.scope === 'personale' && p.clientId === currentClientId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [posts, currentClientId]
  );

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
          Bacheca
        </ThemedText>

        <ThemedText type="smallBold" style={styles.sectionLabel}>
          PER TE
        </ThemedText>
        {personalPosts.length === 0 ? (
          <PlaceholderBanner text="Nessun annuncio personale al momento." />
        ) : (
          personalPosts.map((post) => <BoardPostCard key={post.id} post={post} />)
        )}

        <ThemedText type="smallBold" style={styles.sectionLabel}>
          ANNUNCI GENERALI
        </ThemedText>
        {globalPosts.length === 0 ? (
          <PlaceholderBanner text="Nessun annuncio al momento." />
        ) : (
          globalPosts.map((post) => <BoardPostCard key={post.id} post={post} />)
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function BoardPostCard({ post }: { post: BoardPost }) {
  return (
    <Card style={styles.postCard}>
      <View style={styles.postHeader}>
        <ThemedText type="smallBold" style={styles.postTitle}>
          {post.title}
        </ThemedText>
        {post.priority === 'alta' && <Pill label="Priorità alta" tone="statusExpired" />}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {post.text}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {formatDayMonth(post.date)}
      </ThemedText>
    </Card>
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
  postCard: {
    gap: 4,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  postTitle: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
