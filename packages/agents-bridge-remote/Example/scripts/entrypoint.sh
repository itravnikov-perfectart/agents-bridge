#!/bin/bash

# Set environment variable to suppress WSL install prompt for VS Code
export DONT_PROMPT_WSL_INSTALL=1

# Default parameters
GIT_REPO_URL=""
GIT_TOKEN=""
TASK_TEXT=""
ROO_CONFIG_JSON=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --git-repo)
      GIT_REPO_URL="$2"
      shift 2
      ;;
    --git-token)
      GIT_TOKEN="$2"
      shift 2
      ;;
    --task)
      TASK_TEXT="$2"
      shift 2
      ;;
    --config)
      ROO_CONFIG_JSON="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1"
      echo "Usage: $0 --git-repo <URL> --git-token <TOKEN> --task <TEXT> --config <JSON>"
      exit 1
      ;;
  esac
done

# Validate required parameters
if [ -z "$GIT_REPO_URL" ] || [ -z "$TASK_TEXT" ]; then
  echo "Error: --git-repo and --task are required parameters"
  echo "Usage: $0 --git-repo <URL> --git-token <TOKEN> --task <TEXT> --config <JSON>"
  exit 1
fi

echo "=== Roo Code Task Runner ==="
echo "Git Repository: $GIT_REPO_URL"
echo "Task: $TASK_TEXT"
echo "Config provided: $([ -n "$ROO_CONFIG_JSON" ] && echo "Yes" || echo "No")"
echo "=========================="

# Export environment variables for the TypeScript script
export GIT_REPO_URL
export GIT_TOKEN
export TASK_TEXT
export ROO_CONFIG_JSON

# Run the TypeScript task runner
cd /roo/repo/packages/task-runner
exec tsx src/index.ts 