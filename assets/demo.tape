# Records the README hero demo.
#
#   brew install charmbracelet/tap/vhs
#   pnpm build
#   vhs assets/demo.tape
#
# Runs entirely offline against the committed fixture codebase and the recorded
# Judge answers, so it costs nothing and produces the same output every time.

Output assets/demo.gif
Output assets/demo.mp4

Set Shell bash
Set FontSize 16
Set Width 1200
Set Height 760
Set Theme "Github Dark"
Set Padding 24
Set TypingSpeed 28ms
Set PlaybackSpeed 1.0

# Build the throwaway repository off-camera.
Hide
Type "export PATH=$PWD/node_modules/.bin:$PWD/dist:$PATH" Enter
Type "chutes() { node $OLDPWD/dist/cli.js \"$@\"; }" Enter
Type "cd \"$(./scripts/demo-repo.sh)\"" Enter
Type "clear" Enter
Show

# 1. Nobody knows their Detect Rules before seeing the codebase.
Type "chutes init --report" Sleep 400ms Enter
Sleep 4s

Type "clear" Enter
Sleep 300ms

# 2. Check the rules match what you expect. Contacts nothing.
Type "chutes detect --dry-run --migration fixture" Sleep 400ms Enter
Sleep 4s

Type "clear" Enter
Sleep 300ms

# 3. Classify.
Type "chutes scan --migration fixture" Sleep 400ms Enter
Sleep 4s

# 4. Three piles you can staff.
Type "chutes status --migration fixture" Sleep 400ms Enter
Sleep 3s

Type "clear" Enter
Sleep 300ms

# 5. The document a reviewer actually reads.
Type "head -32 PLAN.md" Sleep 400ms Enter
Sleep 5s
