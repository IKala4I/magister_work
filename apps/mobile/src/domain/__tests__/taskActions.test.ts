/**
 * Action-layer wiring: DAO calls carry the local (pre-auth) owner id, and the PostHog
 * mirror of task_created fires with the categorical payload only (NFR-O1 + NFR-S3).
 */
jest.mock('../../db/client', () => ({ db: {} }));

const mockCreateTask = jest.fn();
const mockUpdateTask = jest.fn();
const mockSoftDeleteTask = jest.fn();
const mockRestoreTask = jest.fn();
jest.mock('../../db/tasks', () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  softDeleteTask: (...args: unknown[]) => mockSoftDeleteTask(...args),
  restoreTask: (...args: unknown[]) => mockRestoreTask(...args),
}));

const mockTrack = jest.fn();
jest.mock('../../observability/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'device-uuid') }));

import type { TaskDraft } from '../../db/tasks';
import { getLocalUserId, isLocalUserId, LOCAL_USER_PREFIX } from '../../sync/localUser';
import {
  createTaskAction,
  deleteTaskAction,
  restoreTaskAction,
  updateTaskAction,
} from '../taskActions';

const DRAFT: TaskDraft = {
  title: 'write report',
  category: 'deep',
  estMinutes: 60,
  value: 2,
  splittable: false,
  deadline: new Date(2026, 7, 28, 23, 59),
  earliestStart: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateTask.mockReturnValue({ id: 't-1' });
});

describe('local pre-auth identity', () => {
  it('derives a stable prefixed id that isLocalUserId recognizes', () => {
    const id = getLocalUserId();
    expect(id).toBe(`${LOCAL_USER_PREFIX}device-uuid`);
    expect(getLocalUserId()).toBe(id);
    expect(isLocalUserId(id)).toBe(true);
    expect(isLocalUserId('7f0b2a4e-real-auth-uuid')).toBe(false);
  });
});

describe('createTaskAction', () => {
  it('writes via the DAO under the local user and mirrors task_created to analytics', () => {
    createTaskAction(DRAFT, { source: 'quick_add', nlParseUsed: true });
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: getLocalUserId(),
        draft: DRAFT,
        meta: { source: 'quick_add', nlParseUsed: true },
      }),
    );
    expect(mockTrack).toHaveBeenCalledWith('task_created', {
      source: 'quick_add',
      nl_parse_used: true,
      has_deadline: true,
      has_duration: true,
    });
    // Never any user-authored text in telemetry (NFR-S3).
    const [, props] = mockTrack.mock.calls[0] as [string, Record<string, unknown>];
    expect(JSON.stringify(props)).not.toContain(DRAFT.title);
  });
});

describe('update/delete/restore forwarding', () => {
  it('forwards ids without emitting analytics', () => {
    updateTaskAction('t-1', DRAFT);
    deleteTaskAction('t-1');
    restoreTaskAction('t-1');
    expect(mockUpdateTask).toHaveBeenCalledWith(expect.anything(), { id: 't-1', draft: DRAFT });
    expect(mockSoftDeleteTask).toHaveBeenCalledWith(expect.anything(), { id: 't-1' });
    expect(mockRestoreTask).toHaveBeenCalledWith(expect.anything(), { id: 't-1' });
    expect(mockTrack).not.toHaveBeenCalled();
  });
});
