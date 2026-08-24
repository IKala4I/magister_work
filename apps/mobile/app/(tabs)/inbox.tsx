import { t } from '../../src/i18n';
import { EmptyState, Screen } from '../../src/ui/primitives';

/** Inbox — unscheduled tasks; CRUD + NL quick-add arrive in P3 (FR-10/11). */
export default function InboxScreen() {
  return (
    <Screen>
      <EmptyState title={t('inbox.empty.title')} body={t('inbox.empty.body')} />
    </Screen>
  );
}
