#!/usr/bin/env python3
"""Fake plugin that ignores SIGTERM — must be killed with SIGKILL."""
import signal, sys, time, json

signal.signal(signal.SIGTERM, signal.SIG_IGN)

# Will be killed by runner timeout + SIGKILL
time.sleep(60)
print(json.dumps({"items": [], "updatedAt": "2026-01-01T00:00:00Z"}))
