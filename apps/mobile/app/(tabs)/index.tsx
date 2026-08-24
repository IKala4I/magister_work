import { t } from '../../src/i18n';
import { EmptyState, Screen } from '../../src/ui/primitives';

/** Today — timeline + glass recommendation blocks arrive in P6 (FR-20/21/22). */
export default function TodayScreen() {
  return (
    <Screen>
      <EmptyState title={t('today.empty.title')} body={t('today.empty.body')} />
    </Screen>
  );
}
