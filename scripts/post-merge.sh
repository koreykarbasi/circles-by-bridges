#!/bin/bash
set -e

echo "Running post-merge setup..."
npm install --legacy-peer-deps
echo "Post-merge setup complete."
