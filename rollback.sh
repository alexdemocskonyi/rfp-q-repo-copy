#!/bin/bash
echo "⏳ Rolling back to last known good version..."
git reset --hard HEAD~1 && \
git push --force origin main && \
echo "✅ Rollback complete. Wait 2–3 min, hard refresh (Cmd+Shift+R)."
