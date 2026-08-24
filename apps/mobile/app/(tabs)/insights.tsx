import { t } from '../../src/i18n';
import { EmptyState, Screen } from '../../src/ui/primitives';

/** Insights — energy heatmap + learned-beliefs surfaces arrive in P9 (FR-40/41). */
export default function InsightsScreen() {
  return (
    <Screen>
      <EmptyState title={t('insights.empty.title')} body={t('insights.empty.body')} />
    </Screen>
  );
}
