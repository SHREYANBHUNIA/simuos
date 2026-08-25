# Process contracts

Process records contain a stable identifier, arrival time, CPU burst, priority, optional queue level, and visual metadata. These fields are JSON-compatible so client, Rust core, and FastAPI layers exchange a single workload shape.
