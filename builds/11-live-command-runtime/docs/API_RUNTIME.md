# Live Command Runtime API

## Query

GET /v1/runtime/command/state

Returns the current authorized command state.

## Stream

GET /v1/runtime/command/events

Server-sent event stream for authorized tenant events.

## Commands

POST /v1/runtime/command/investigate
POST /v1/runtime/command/prepare
POST /v1/runtime/command/request-approval

## Runtime response

Every command returns:

- command_request_id
- correlation_id
- status
- policy_status
- authorization_status
- result or next_action

## Idempotency

All commands that can create work or side effects require an idempotency key.

The server derives tenant/user scope from the authenticated session.
