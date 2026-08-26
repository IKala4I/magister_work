/**
 * Task sheet validation (FR-10): the earliest-start ≤ deadline cross-field rule must be
 * enforced in the form itself — Save disabled plus a visible reason — because the DAO's
 * assertValidDraft throw is uncaught in the screens' onPress handlers (a reachable fatal
 * error, found by the P3 adversarial pass). Also pins the radio-chip accessibility state
 * (RN's documented pairing for role="radio" is `checked`, not `selected`).
 */
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
}));

import { render, fireEvent, screen } from '@testing-library/react-native';

import type { TaskRow } from '../db/tasks';
import { en } from '../i18n/en';
import { TaskForm } from '../ui/task/TaskForm';

function existingTask(overrides: Partial<TaskRow>): TaskRow {
  return {
    id: 't-1',
    userId: 'local:u',
    title: 'write report',
    category: 'deep',
    estMinutes: 60,
    deadline: null,
    value: 2,
    splittable: false,
    earliestStart: null,
    recurrence: null,
    status: 'inbox',
    doneAt: null,
    postponeCount: 0,
    deletedAt: null,
    version: 1,
    createdAt: new Date(2026, 7, 24, 9, 0),
    updatedAt: new Date(2026, 7, 24, 9, 0),
    serverSeq: null,
    ...overrides,
  };
}

describe('TaskForm cross-field validation (FR-10)', () => {
  it('earliest start after the deadline disables Save and shows the reason', async () => {
    const onSubmit = jest.fn();
    await render(
      <TaskForm
        initial={existingTask({
          deadline: new Date(2026, 7, 28, 23, 59),
          earliestStart: new Date(2026, 7, 30, 0, 0),
        })}
        submitLabel={en['task.save']}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText(en['task.field.range.error'])).toBeTruthy();
    await fireEvent.press(screen.getByText(en['task.save']));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('same-day earliest start and deadline is valid (start-of-day ≤ end-of-day)', async () => {
    const onSubmit = jest.fn();
    await render(
      <TaskForm
        initial={existingTask({
          deadline: new Date(2026, 7, 28, 23, 59),
          earliestStart: new Date(2026, 7, 28, 0, 0),
        })}
        submitLabel={en['task.save']}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.queryByText(en['task.field.range.error'])).toBeNull();
    await fireEvent.press(screen.getByText(en['task.save']));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('radio chips expose their state as checked (not selected)', async () => {
    await render(
      <TaskForm initial={existingTask({})} submitLabel={en['task.save']} onSubmit={jest.fn()} />,
    );
    const deepChip = screen.getByLabelText(en['task.category.deep']);
    expect(deepChip.props.accessibilityState).toEqual({ checked: true });
    const adminChip = screen.getByLabelText(en['task.category.admin']);
    expect(adminChip.props.accessibilityState).toEqual({ checked: false });
  });
});
