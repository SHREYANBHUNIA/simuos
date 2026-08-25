"""Portable FastAPI + SQLite persistence service for SimuOS experiment records.

Run independently in a Python environment with: uvicorn api.main:app --reload
The managed React application keeps interactive simulations local for instant feedback;
this service provides the planned persistence boundary for standalone deployments.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

DATABASE_PATH = Path(__file__).with_name("simuos.sqlite3")
app = FastAPI(title="SimuOS API", version="0.1.0")


class ExperimentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(pattern="^(cpu|page-replacement|memory-allocation)$")
    workload: dict[str, Any]
    configuration: dict[str, Any]
    result: dict[str, Any]


class Experiment(ExperimentCreate):
    id: int
    created_at: str


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize() -> None:
    with connect() as database:
        database.execute(
            """
            CREATE TABLE IF NOT EXISTS experiments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                workload TEXT NOT NULL,
                configuration TEXT NOT NULL,
                result TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )


@app.on_event("startup")
def startup() -> None:
    initialize()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/experiments", response_model=list[Experiment])
def list_experiments() -> list[Experiment]:
    with connect() as database:
        rows = database.execute("SELECT * FROM experiments ORDER BY id DESC").fetchall()
    return [
        Experiment(
            id=row["id"],
            name=row["name"],
            kind=row["kind"],
            workload=json.loads(row["workload"]),
            configuration=json.loads(row["configuration"]),
            result=json.loads(row["result"]),
            created_at=row["created_at"],
        )
        for row in rows
    ]


@app.post("/experiments", response_model=Experiment, status_code=201)
def create_experiment(payload: ExperimentCreate) -> Experiment:
    created_at = datetime.now(timezone.utc).isoformat()
    with connect() as database:
        cursor = database.execute(
            "INSERT INTO experiments (name, kind, workload, configuration, result, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (payload.name, payload.kind, json.dumps(payload.workload), json.dumps(payload.configuration), json.dumps(payload.result), created_at),
        )
    return Experiment(id=cursor.lastrowid, created_at=created_at, **payload.model_dump())


@app.get("/experiments/{experiment_id}", response_model=Experiment)
def get_experiment(experiment_id: int) -> Experiment:
    with connect() as database:
        row = database.execute("SELECT * FROM experiments WHERE id = ?", (experiment_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return Experiment(
        id=row["id"], name=row["name"], kind=row["kind"], workload=json.loads(row["workload"]),
        configuration=json.loads(row["configuration"]), result=json.loads(row["result"]), created_at=row["created_at"],
    )
