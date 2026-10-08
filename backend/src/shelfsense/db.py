import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://shelfsense:change-me@127.0.0.1:5432/shelfsense"
)
MEDIA_ROOT = Path(
    os.getenv("MEDIA_DIR", str(Path(__file__).resolve().parents[2] / "media"))
).resolve()
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args={"connect_timeout": 3})
Session = sessionmaker(engine, expire_on_commit=False)
