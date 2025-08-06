#!/usr/bin/env bash
set -e

cd ~/Downloads/rfp_search_app_bundle_copy

# 1) Remove any [[plugins]] block from netlify.toml
perl -0777 -pi -e 's/\n\[\[plugins\]\][\s\S]*//g' netlify.toml

# 2) Commit & push
git add netlify.toml
git commit -m "chore: remove broken plugin config from netlify.toml"
git push origin main

echo "✅ Done — Netlify will rebuild without that plugin. Watch your deploy logs."
