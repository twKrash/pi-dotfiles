# Run Claude Code through the local Headroom proxy when Headroom is installed.
# `headroom wrap claude` starts the proxy when it is not running and passes all
# arguments on to claude. Without Headroom, plain claude runs unchanged.
# `command claude` bypasses this function.
claude() {
  if command -v headroom >/dev/null 2>&1; then
    headroom wrap claude "$@"
  else
    command claude "$@"
  fi
}
