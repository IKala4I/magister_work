import { t } from '../../src/i18n';
import { EmptyState, Screen } from '../../src/ui/primitives';

/** Focus — timer ring + session rating arrive in P7 (FR-30/31). */
export default function FocusScreen() {
  return (
    <Screen>
      <EmptyState title={t('focus.empty.title')} body={t('focus.empty.body')} />
    </Screen>
  );
}
