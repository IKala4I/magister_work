#!/bin/zsh
# iPhone-pass helper (2026-09-08): the overnight reconstruction from a `pymobiledevice3 syslog collect`
# archive — Hourwell fires / schedule passes, freeze-thaw-kill, lock stamps. Edit the --start/--end
# windows. Usage: hw-ios-overnight-logshow.sh <device.logarchive> <out-dir>
# After `pymobiledevice3 syslog collect $S/device3.logarchive`: the overnight reconstruction.
A="$1"; O="$2"; mkdir -p "$O"
L=/usr/bin/log
# (a) every Hourwell fire since 17:30 yesterday (the 20:00 question + this morning's nudges)
$L show --archive "$A" --start '2026-09-07 17:30:00' --end '2026-09-08 12:30:00' --predicate 'eventMessage CONTAINS "[com.hourwell.app]" AND (eventMessage CONTAINS "Persistent timer fired" OR eventMessage CONTAINS "has a current trigger date" OR eventMessage CONTAINS "Removing all pending" OR eventMessage CONTAINS "Adding notification request")' --style compact 2>/dev/null > "$O/fires.txt"
# (b) Hourwell process lifecycle overnight: freeze/thaw/kill, foreground/background, launches
$L show --archive "$A" --start '2026-09-07 17:00:00' --end '2026-09-08 12:30:00' --predicate '(eventMessage CONTAINS "Hourwell" AND (eventMessage CONTAINS "memorystatus" OR eventMessage CONTAINS "Scene lifecycle" OR eventMessage CONTAINS "Process launched" OR eventMessage CONTAINS "exited" OR eventMessage CONTAINS "killed" OR eventMessage CONTAINS "jetsam")) OR (process == "Hourwell" AND subsystem == "com.apple.UserNotifications")' --style compact 2>/dev/null > "$O/lifecycle.txt"
# (c) lock/unlock stamps (keybag) — proves nobody unlocked
$L show --archive "$A" --start '2026-09-07 17:00:00' --end '2026-09-08 12:30:00' --predicate 'eventMessage CONTAINS "keybag" AND (eventMessage CONTAINS "unlock" OR eventMessage CONTAINS "lock")' --style compact 2>/dev/null | grep -viE "ExtraDebug|ATTEMPT" > "$O/keybag.txt"
wc -l "$O"/*.txt
