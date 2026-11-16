#!/usr/bin/env bash
# Fails if a table is defined (CREATE TABLE) in more than one build file.
# Two builds defining the same table means whichever runs first wins and the other
# build's columns silently never exist. The three below were found and reconciled
# with explicit ALTER statements in the later build; anything new must be fixed the
# same way (or the second definition removed) before it is allowed in.
set -euo pipefail
cd "$(dirname "$0")/../.."
KNOWN="nova_billing_events nova_privacy_holds nova_subscriptions"
dups=$(for f in $(ls builds/*/sql/build_*.sql | sort -V); do
         grep -oiE "create table (if not exists )?[a-z_0-9]+" "$f" | awk '{print tolower($NF)}' | sort -u | sed "s|\$|\t$f|"
       done | awk -F'\t' '{c[$1]++; w[$1]=w[$1]" "$2} END {for (t in c) if (c[t]>1) print t"\t"w[t]}' | sort)
bad=0
while IFS=$'\t' read -r t where; do
  [ -z "$t" ] && continue
  if [[ " $KNOWN " != *" $t "* ]]; then echo "SCHEMA DRIFT: $t is defined in more than one build:$where"; bad=1; fi
done <<< "$dups"
[ $bad -eq 0 ] && echo "schema drift check: OK (no new duplicate table definitions)"
exit $bad
