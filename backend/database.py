import os
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./netra.db")

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    pool_pre_ping=True,
)

if DATABASE_URL.startswith("sqlite"):
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL")
        conn.exec_driver_sql("PRAGMA synchronous=NORMAL")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


@contextmanager
def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    if DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            try:
                # audit_log migrations
                res = conn.exec_driver_sql("PRAGMA table_info(audit_log)").fetchall()
                col_names = [row[1] for row in res]
                if col_names and "previous_hash" not in col_names:
                    conn.exec_driver_sql("ALTER TABLE audit_log ADD COLUMN previous_hash VARCHAR(64)")
                if col_names and "current_hash" not in col_names:
                    conn.exec_driver_sql("ALTER TABLE audit_log ADD COLUMN current_hash VARCHAR(64)")

                # decisions migrations (forensic provenance linkage)
                d_res = conn.exec_driver_sql("PRAGMA table_info(decisions)").fetchall()
                d_cols = [row[1] for row in d_res]
                if d_cols and "event_id" not in d_cols:
                    conn.exec_driver_sql("ALTER TABLE decisions ADD COLUMN event_id VARCHAR(64)")
                if d_cols and "audit_id" not in d_cols:
                    conn.exec_driver_sql("ALTER TABLE decisions ADD COLUMN audit_id VARCHAR(64)")
                if d_cols and "audit_hash" not in d_cols:
                    conn.exec_driver_sql("ALTER TABLE decisions ADD COLUMN audit_hash VARCHAR(64)")

                # events migrations
                e_res = conn.exec_driver_sql("PRAGMA table_info(events)").fetchall()
                e_cols = [row[1] for row in e_res]
                if e_cols and "audit_id" not in e_cols:
                    conn.exec_driver_sql("ALTER TABLE events ADD COLUMN audit_id VARCHAR(64)")
                if e_cols and "audit_hash" not in e_cols:
                    conn.exec_driver_sql("ALTER TABLE events ADD COLUMN audit_hash VARCHAR(64)")
            except Exception:
                pass
