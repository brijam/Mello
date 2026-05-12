# Mello — Minimum Hardware

The bottleneck is Postgres + Redis + Node, not the app itself.

## Realistic minimum (dev / personal use, single-digit users)

- **CPU**: 2 cores (any x86_64 from the last decade, or ARM64 like a Raspberry Pi 4/5)
- **RAM**: 2 GB usable
  - ~256 MB Postgres
  - ~64 MB Redis
  - ~200–400 MB per Node process (server + Vite in dev)
  - 1 GB is painful once you build the client
- **Disk**: 2–3 GB for node_modules + Docker images + DB; SSD strongly preferred (Postgres on SD card / spinning rust is miserable)
- **OS**: anything that runs Docker + Node 20 (Linux, macOS, Windows w/ WSL2)

## Comfortable floor for a small prod-like deploy (10–50 users)

2 vCPU / 4 GB RAM / 20 GB SSD — e.g. a $5–10/mo VPS (Hetzner CX22, DO basic droplet).

Socket.IO fanout and Postgres make you want more RAM before more CPU.

## Won't work well

Anything below 1 GB RAM (Pi Zero 2, low-tier shared hosts) — `npm install` alone will OOM, and Postgres + Redis + two Node processes won't coexist.
