import { en } from '../../i18n/en';
import { RATIONALE_KEYS, rationaleSentence } from '../rationale';

describe('rationaleSentence (FR-21: key + params → one sentence, client-rendered)', () => {
  it('renders every closed-vocabulary key', () => {
    expect(rationaleSentence('pinned', {})).toBe(en['rationale.pinned']);
    expect(rationaleSentence('experiment', { category: 'admin', daypart: 'AF' })).toBe(
      'Experiment: trying Admin in the afternoon to learn what works for you.',
    );
    expect(rationaleSentence('deadline_pressure', { hours_to_deadline: 3.4 })).toBe(
      'Due in about 3 h — placed early to protect the deadline.',
    );
    expect(rationaleSentence('deadline_pressure', { hours_to_deadline: 0.5 })).toBe(
      'Due in about <1 h — placed early to protect the deadline.',
    );
    expect(rationaleSentence('deadline_pressure', {})).toBe(
      en['rationale.deadline_pressure.generic'],
    );
    expect(rationaleSentence('energy_peak', { category: 'deep', daypart: 'MO', factor: 1.4 })).toBe(
      'You finish Deep work best in the morning (+40%).',
    );
    expect(rationaleSentence('energy_peak', { category: 'deep', daypart: 'MO' })).toBe(
      'You finish Deep work best in the morning.',
    );
    expect(rationaleSentence('fresh_slot', { category: 'learning', daypart: 'MO' })).toBe(
      'A fresh morning slot for Learning.',
    );
    expect(rationaleSentence('earliest_feasible', { category: 'physical' })).toBe(
      'Earliest slot that fits Physical.',
    );
    expect(rationaleSentence('best_available', { category: 'admin', daypart: 'EV' })).toBe(
      'Best available evening slot for Admin.',
    );
    expect(RATIONALE_KEYS).toHaveLength(7);
  });
  it('degrades gracefully on unknown keys and missing params', () => {
    expect(rationaleSentence('something_new', null)).toBe(en['rationale.generic']);
    expect(rationaleSentence('best_available', null)).toBe(
      'Best available day slot for this task.',
    );
  });
});
