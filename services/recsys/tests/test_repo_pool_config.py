"""PostgresRepo pool configuration — checkable without a database (the pool is created closed).

ADR-0009 / runbook §6: the service connects through Supabase's transaction pooler (port 6543),
which does not support server-side prepared statements; psycopg must therefore run with
``prepare_threshold=None`` or fail after a statement's fifth execution on a reused connection.
"""

from hourwell_recsys.repo import PostgresRepo


def test_pool_disables_server_side_prepared_statements() -> None:
    repo = PostgresRepo("postgresql://user:pw@localhost:6543/postgres?sslmode=require")
    kwargs = repo._pool.kwargs  # noqa: SLF001 — configuration under test
    assert isinstance(kwargs, dict)  # psycopg_pool also accepts a callable; we pass a dict
    assert kwargs["prepare_threshold"] is None
    assert kwargs["row_factory"].__name__ == "dict_row"


def test_pool_is_small_and_lazy() -> None:
    repo = PostgresRepo("postgresql://user:pw@localhost:6543/postgres")
    assert repo._pool.min_size == 0  # noqa: SLF001
    assert repo._pool.max_size == 4  # noqa: SLF001
