import {
  ATTRIBUTION_LOCAL_TIME,
  NOTIFICATION_DAILY_CAP,
  PAR_GRACE_MINUTES,
  PAR_MIN_FRACTION,
  TOP_M,
  UNDO_WINDOW_SECONDS,
} from '@hourwell/shared';

describe('spec-fixed Appendix A values (TS side)', () => {
  it('pins the PAR anchors to File 06 §1.4', () => {
    expect(PAR_GRACE_MINUTES).toBe(15);
    expect(PAR_MIN_FRACTION).toBe(0.5);
  });

  it('pins spec-fixed product constants', () => {
    expect(TOP_M).toBe(4); // File 04 §1.4
    expect(NOTIFICATION_DAILY_CAP).toBe(5); // FR-50
    expect(UNDO_WINDOW_SECONDS).toBe(6); // File 02 §3.4
    expect(ATTRIBUTION_LOCAL_TIME).toBe('23:55'); // File 05 §1
  });
});
