"""The simulation study — the evaluation performed in simulation (ADR-0020).

Implements exactly the analysis plan frozen in `docs/study/preregistration.md` (committed
before this package existed): E1 estimator study, E2 simulation-based power, E3 closed-loop
ABAB study on the service's own Stage 2–4 code. `hourwell-simstudy` runs the registered
configuration once and writes machine-readable results next to the results document.
"""

from hourwell_training.simstudy.config import REGISTERED, StudyConfig

__all__ = ["REGISTERED", "StudyConfig"]
