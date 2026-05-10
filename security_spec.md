# Security Specification for Chronos Flow

## Data Invariants
1. A task must have a `userId` that matches the authenticated user.
2. A task must have a `status` within the allowed set (pending, in_progress, completed, skipped).
3. Priority and Energy Level must be between 1 and 5.
4. Users can only read and write their own tasks.
5. Users can only read and write their own analytics data.

## The "Dirty Dozen" Payloads (Expected to be REJECTED)
1. **Identity Spoofing**: Creating a task with someone else's `userId`.
2. **Invalid Priority (High)**: Creating a task with `priority: 10`.
3. **Invalid Priority (Low)**: Creating a task with `priority: 0`.
4. **Invalid Energy (High)**: Creating a task with `energyLevel: 6`.
5. **Invalid Energy (Low)**: Creating a task with `energyLevel: 0`.
6. **Invalid Status**: Creating a task with `status: 'deleted'`.
7. **Junk ID Poisoning**: Creating a task with a document ID that is 2KB long.
8. **Field Injection**: Updating a task with an extra `isAdmin: true` field.
9. **Timestamp Spoofing**: Providing a `createdAt` timestamp from the future (client-side).
10. **Cross-User Read**: Trying to `get` a task belonging to another user.
11. **Cross-User Update**: Trying to `update` another user's task.
12. **PII Leakage Attempt**: Trying to read the `analytics` collection of all users.
