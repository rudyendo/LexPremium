# Security Specification for LexPremium

## Data Invariants
1. **Ownership**: All user-specific data (deadlines, adminTasks, clients, jurisprudencias, settings) MUST be owned by the user who created it, verified via `userId`.
2. **Access Control**: Users can only read, create, update, or delete documents where `userId` matches their own `request.auth.uid`.
3. **Integrity**:
    - `createdAt` is immutable after creation.
    - `status` for deadlines and adminTasks must be one of the allowed values.
    - Document IDs must follow a strict pattern (handled by Firestore).
4. **Validation**: All writes must pass schema validation for required fields and types.

## The "Dirty Dozen" Payloads (Deny Cases)
1. **Identity Spoofing**: Attempt to create a deadline with a `userId` different from the authenticated user.
2. **Unauthorized Read**: Attempt to read another user's client profile.
3. **Malicious ID**: Attempt to create a document with a 1MB string as ID.
4. **Status Shortcut**: Attempt to set a status not in the enum.
5. **PII Leak**: Attempt to list all settings entries without filtering by `userId`.
6. **Shadow Update**: Attempt to add an `isAdmin` field to a user settings document.
7. **Type Poisoning**: Sending a string for a number field (e.g., `greenAlertDays`).
8. **Orphaned Write**: Creating a deadline without a valid `peca` or `empresa`.
9. **Timestamp Manipulation**: Providing a future `createdAt` date from the client.
10. **Bypassing Verification**: Attempting a write when `email_verified` is false (if required).
11. **Cross-User Update**: Attempting to update another user's task.
12. **Resource Exhaustion**: Sending a 1MB string for the `document` field in a client.

## Test Runner
A `firestore.rules.test.ts` file will be created to verify these assertions.
