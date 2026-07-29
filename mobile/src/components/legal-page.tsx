import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppCard, AppScreen, BackHeader } from '@/components/ui';
import { APP_NAME, getLegalProductionAuditErrors, isLegalProductionReady, LEGAL_CONFIG } from '@/constants/app-info';
import { AppFontSize, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';

export type LegalSection = {
  title: string;
  body: string[];
};

type LegalPageProps = {
  title: string;
  version: string;
  sections: LegalSection[];
  children?: ReactNode;
};

export function LegalPage({ title, version, sections, children }: LegalPageProps) {
  const { colors } = useAppTheme();
  const auditErrors = getLegalProductionAuditErrors();
  const [businessInfoOpen, setBusinessInfoOpen] = useState(false);

  return (
    <AppScreen bottomTabInset={false} contentStyle={styles.content}>
      <BackHeader title={title} fallbackHref="/" />
      <View style={styles.hero}>
        <Text style={[AppTextStyle.title, { color: colors.ink }]}>{title}</Text>
        <Text style={[styles.meta, { color: colors.inkSoft }]}>
          {APP_NAME} - versione {version} - efficace dal {formatDate(LEGAL_CONFIG.effectiveDate)}
        </Text>
      </View>

      {!isLegalProductionReady() ? (
        <AppCard style={styles.warningCard}>
          <View style={styles.warningHeader}>
            <ExternalLink size={16} color={colors.amber} />
            <Text style={[styles.warningTitle, { color: colors.ink }]}>Audit URL production non completato</Text>
          </View>
          <Text style={[styles.bodyText, { color: colors.inkSoft }]}>
            Le pagine sono leggibili, ma in produzione serve EXPO_PUBLIC_LEGAL_PUBLIC_BASE_URL configurato con URL HTTPS pubblico.
          </Text>
          <View style={styles.badges}>
            {auditErrors.map((error) => (
              <AppBadge key={error} label={error} tone="amber" />
            ))}
          </View>
        </AppCard>
      ) : null}

      <AppCard style={styles.ownerCard}>
        <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Dati del titolare</Text>
        <LegalField
          label="Titolare del trattamento"
          value={`${LEGAL_CONFIG.legalBusinessName}\n${LEGAL_CONFIG.legalForm}`}
        />
        <LegalField label="Sede legale" value={formatLegalAddress(LEGAL_CONFIG.legalAddress)} />
        <LegalField
          label="Contatti privacy e assistenza"
          value={LEGAL_CONFIG.privacyEmail}
          href={`mailto:${LEGAL_CONFIG.privacyEmail}`}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: businessInfoOpen }}
          accessibilityLabel={businessInfoOpen ? 'Nascondi informazioni aziendali' : 'Mostra informazioni aziendali'}
          onPress={() => setBusinessInfoOpen((current) => !current)}
          style={({ pressed }) => [styles.businessToggle, pressed ? { opacity: 0.72 } : null]}
        >
          <View style={styles.businessToggleContent}>
            {businessInfoOpen ? <ChevronDown size={18} color={colors.moss} /> : <ChevronRight size={18} color={colors.moss} />}
            <Text style={[styles.businessToggleText, { color: colors.ink }]}>Informazioni aziendali</Text>
          </View>
        </Pressable>
        {businessInfoOpen ? (
          <View style={styles.businessDetails}>
            <LegalField label="Partita IVA" value={LEGAL_CONFIG.vatNumber} compact />
            <LegalField label="REA" value={LEGAL_CONFIG.reaNumber} compact />
            <LegalField label="Registro Imprese" value={`Registro Imprese di ${LEGAL_CONFIG.chamberOfCommerce}`} compact />
            <LegalField label="PEC" value={LEGAL_CONFIG.pecEmail} href={`mailto:${LEGAL_CONFIG.pecEmail}`} compact />
          </View>
        ) : null}
      </AppCard>

      {sections.map((section, index) => (
        <AppCard key={`${section.title}-${index}`} style={styles.sectionCard}>
          <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>{index + 1}. {section.title}</Text>
          {section.body.map((paragraph, paragraphIndex) => (
            <Text key={paragraphIndex} style={[styles.bodyText, { color: colors.inkSoft }]}>
              {paragraph}
            </Text>
          ))}
        </AppCard>
      ))}
      {children}
    </AppScreen>
  );
}

function LegalField({ label, value, href, compact = false }: { label: string; value: string; href?: string; compact?: boolean }) {
  const { colors } = useAppTheme();
  const valueNode = (
    <Text style={[compact ? styles.fieldValueCompact : styles.fieldValue, { color: href ? colors.moss : colors.ink }]}>
      {value}
    </Text>
  );

  return (
    <View style={[styles.fieldRow, compact ? styles.fieldRowCompact : null]}>
      <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>{label}</Text>
      {href ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(href)} hitSlop={8}>
          {valueNode}
        </Pressable>
      ) : (
        valueNode
      )}
    </View>
  );
}

function formatLegalAddress(value: string) {
  return value.replace(', 80135', '\n80135');
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const styles = StyleSheet.create({
  content: {
    gap: AppSpacing[3],
  },
  hero: {
    gap: AppSpacing[1],
  },
  meta: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  warningCard: {
    gap: AppSpacing[2],
  },
  warningHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  warningTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  ownerCard: {
    gap: AppSpacing[2],
  },
  businessToggle: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    marginTop: AppSpacing[1],
  },
  businessToggleContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[1],
    minHeight: 34,
  },
  businessToggleText: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
  },
  businessDetails: {
    gap: AppSpacing[2],
    paddingTop: AppSpacing[1],
  },
  sectionCard: {
    gap: AppSpacing[2],
  },
  bodyText: {
    fontSize: AppFontSize.base,
    lineHeight: 19,
  },
  fieldRow: {
    gap: 2,
  },
  fieldRowCompact: {
    gap: 1,
  },
  fieldLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  fieldValue: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
    lineHeight: 21,
  },
  fieldValueCompact: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
    lineHeight: 18,
  },
});
