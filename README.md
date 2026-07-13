# KitGrid

Equipment booking platform (MERN) with a customer/admin role split. Built in phases per
the KitGrid development plan — see `docs/` for the threat model, key management notes,
accessibility findings, and pentest documentation as they're added.

## Stack

- **Backend**: Node.js + Express, MongoDB (Mongoose), Redis
- **Frontend**: React + Vite
- **Infra**: Docker Compose (mongo, redis, backend, frontend)

## Getting started

1. Copy the env examples and fill in secrets:
   ```
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
2. Start everything:
   ```
   docker compose up --build
   ```
3. Backend: http://localhost:5000 · Frontend: http://localhost:5173

## Status

Scaffolding only — business logic (auth, RBAC, booking flow, etc.) is added incrementally
across the development phases.
