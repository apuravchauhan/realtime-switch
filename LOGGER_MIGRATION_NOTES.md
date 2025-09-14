# Logger Migration Notes

## Files with console statements that need Logger replacement

### Files where accountId is NULL/unavailable:

1. **orchestrator/src/Server.ts**
   - Global error handlers (uncaughtException, unhandledRejection, SIGTERM, SIGINT)
   - Graceful shutdown functions
   - Server startup/initialization logs
   - Auth validation before accountId is extracted
   - STATUS: **Partially migrated**

2. **orchestrator/src/Banner.ts**
   - Server startup banner display
   - No user context available

3. **core/src/config/Config.ts**
   - Configuration loading/validation
   - System-level logs

4. **observability/setup.js** & **observability/monitor.js**
   - System monitoring scripts
   - PM2 process monitoring
   - No user context

5. **All test files** (*.test.ts, test/*.js, test/*.ts)
   - Unit/integration test logging
   - No user context available during testing

6. **orchestrator/test-server.js**
   - Development test server
   - No user context

### Files where accountId IS available:

1. **implementations/providers/oai/src/OAIEventManager.ts**
   - Has accountId in constructor
   - WebSocket connection logs
   - Performance stats

2. **implementations/providers/gemini/src/GeminiEventManager.ts**
   - Has accountId in constructor
   - Connection management logs

3. **orchestrator/src/Pipeline.ts**
   - Has accountId passed from Server
   - Session management logs

4. **orchestrator/src/SessionManager.ts**
   - Has accountId in constructor
   - Session persistence logs

5. **implementations/checkpoint/src/BaseCheckpoint.ts**
   - Has accountId in constructor
   - Conversation logging

6. **Server.ts WebSocket handlers**
   - Has userData.accountId available
   - Connection close, error handling

### Files that need analysis:

1. **implementations/checkpoint/src/SQLitePersistence.ts**
   - Database operations
   - May have accountId from calling context

2. **implementations/checkpoint/src/ipc/SecureIPCClient.ts**
   - IPC communication logs
   - System-level operations

3. **All transformer files**
   - Event transformation logs
   - May not have direct accountId access

4. **All extractor files**
   - Event parsing logs
   - May not have direct accountId access

## Required Changes:

### 1. Logger Interface Updated:
- Now accepts `string | null` for accountId
- Use `null` when accountId unavailable

### 2. Static Class Names:
- Add `const CLASS_NAME = 'ClassName';` at top of each file
- Prevents repeated string allocations

### 3. Pattern for Migration:

```typescript
// Before:
console.log('Message');
console.error('Error:', error);

// After:
const CLASS_NAME = 'MyClass';
Logger.debug(CLASS_NAME, accountId || null, 'Message');
Logger.error(CLASS_NAME, accountId || null, 'Error description', error);
```

## Cannot Replace (Leave as console.*):

1. **Development/Debug files:**
   - Test files that expect console output
   - Development utilities
   - Build scripts

2. **Third-party integration:**
   - Files that other systems expect console output from
   - Monitoring scripts that parse console output

3. **Error conditions where Logger might fail:**
   - Logger initialization errors
   - Critical system failures before Logger is available