# SimuOS Architecture

SimuOS separates deterministic operating-system experiments from the presentation layer. The live laboratory currently executes the shared, typed simulation engine in the React client so every parameter edit is immediately observable. The same domain contracts are designed to move behind the `api/` service boundary for persisted experiments, batch runs, and multi-user collaboration.

| Layer | Primary responsibility | Implementation boundary |
|---|---|---|
| `scheduler/` | CPU dispatch, queues, and process timing | Rust-compatible core module boundary; mirrored by the tested browser engine during interactive runs |
| `memory/` | Page replacement and allocation state transitions | Rust-compatible core module boundary; mirrored by the tested browser engine during interactive runs |
| `processes/`, `workloads/`, `metrics/` | Canonical input, generation, and result contracts | Shared JSON-compatible schemas |
| `simulation/` | Experiment orchestration and reproducibility metadata | Service-level orchestration boundary |
| `api/` | Experiment persistence and retrieval | FastAPI with SQLite schema for standalone/local deployment |
| `frontend/` | React, TypeScript, D3 interaction model | Managed web application source in `client/` |

The managed web application uses its supplied TypeScript server and database integration for the interactive deployment. The FastAPI and SQLite service is included as a portable standalone service layer, rather than started beside the managed web server, because the deployment target runs one managed server process. The canonical simulation input and output shapes are intentionally JSON-compatible so the web client can move from local evaluation to the FastAPI endpoint without changing the visualization model.

## Experiment record

An experiment record stores a named workload, algorithm identifier, configuration object, and immutable result payload. Keeping inputs beside results makes comparison cards reproducible and lets future Rust implementations be verified against the same fixtures.
