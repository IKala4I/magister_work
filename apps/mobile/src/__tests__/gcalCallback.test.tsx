/**
 * The calendar consent landing (ADR-0012 §10): says what it is doing, and once the confirm
 * lands it returns to Settings by itself (hardware pass 2026-09-07 item 43: the screen showed
 * "connected" for both states and never left; the owner waited five minutes).
 */
const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockParams = { status: 'ok', confirm: 'tok' } as { status?: string; confirm?: string };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
const mockConfirm = jest.fn<Promise<{ ok: boolean }>, [string]>();
jest.mock('../sync/gcal', () => ({ gcalConfirm: (t: string) => mockConfirm(t) }));

import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GcalCallbackScreen, { GCAL_CALLBACK_LEAVE_MS } from '../../app/gcal-callback';
import { en } from '../i18n/en';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

beforeEach(() => {
  jest.useFakeTimers();
  mockRouter.replace.mockClear();
  mockConfirm.mockReset();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('gcal-callback', () => {
  it('shows "connecting" while the confirm runs, then "connected" and returns to Settings on its own', async () => {
    let resolve: (r: { ok: boolean }) => void = () => undefined;
    mockConfirm.mockImplementation(() => new Promise((r) => (resolve = r)));
    await render(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <GcalCallbackScreen />
      </SafeAreaProvider>,
    );
    expect(screen.getByText(en['gcal.callback.working'])).toBeTruthy();
    expect(screen.queryByText(en['gcal.callback.ok'])).toBeNull();
    await act(async () => resolve({ ok: true }));
    expect(screen.getByText(en['gcal.callback.ok'])).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(GCAL_CALLBACK_LEAVE_MS);
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/settings');
  });

  it('a failed confirm stays on screen with the failure copy and the back button', async () => {
    mockConfirm.mockResolvedValue({ ok: false });
    await render(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <GcalCallbackScreen />
      </SafeAreaProvider>,
    );
    await act(async () => {
      jest.advanceTimersByTime(GCAL_CALLBACK_LEAVE_MS * 2);
    });
    expect(screen.getByText(en['gcal.callback.failed'])).toBeTruthy();
    expect(screen.getByText(en['gcal.callback.back'])).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
