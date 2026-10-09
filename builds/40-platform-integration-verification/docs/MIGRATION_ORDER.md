# Database Migration Order

Every migration should have:
- stable identifier
- build owner
- checksum
- dependencies
- expected schema effect
- rollback/forward-recovery strategy
- environment application record
- post-migration verification

Never infer that migrations are safe merely because SQL files exist. Apply them to disposable or staging databases first, using controlled credentials and backups appropriate to the environment.
