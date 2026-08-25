# Scheduler module boundary

This directory is reserved for the Rust scheduling core. Its public contract matches the CPU workload and timeline records in `client/src/lib/simulations.ts`, allowing a Rust implementation to be checked against the same experiment fixtures before it is exposed through FastAPI.
