# Research: Consultant Dashboard (Spec 017)

## External System Integration Research

### Supported Project Management Systems

#### 1. Jira (Atlassian)
**API Version**: REST API v2/v3
**Authentication**: 
- API Token (recommended)
- OAuth 2.0
- Basic Auth (deprecated)

**Key Endpoints**:
- `GET /rest/api/3/search` - Search issues
- `GET /rest/api/3/issue/{id}` - Get issue details
- `GET /rest/api/3/project` - List projects

**Rate Limits**: 
- 10 requests/second for API tokens
- 1000 requests/hour for OAuth

**Documentation**: https://developer.atlassian.com/cloud/jira/platform/rest/v3/

**Implementation Notes**:
- Supports both cloud and server instances
- Webhook support available (future enhancement)
- Rich query language (JQL)

#### 2. Monday.com
**API Version**: GraphQL API v2024-01
**Authentication**: 
- API Token (Personal or OAuth)

**Key Queries**:
- `boards` - List boards
- `items` - Get items (tasks)
- `updates` - Get updates/comments

**Rate Limits**:
- 10,000,000 complexity points per minute
- 500 requests per minute

**Documentation**: https://developer.monday.com/api-reference/

**Implementation Notes**:
- GraphQL only, no REST
- Complexity-based rate limiting
- Real-time updates via webhooks

#### 3. Trello
**API Version**: REST API v1
**Authentication**: 
- API Key + Token
- OAuth 1.0a

**Key Endpoints**:
- `GET /1/members/{id}/boards` - List boards
- `GET /1/boards/{id}/cards` - Get cards
- `GET /1/cards/{id}` - Get card details

**Rate Limits**:
- 300 requests per 10 seconds per API key
- 100 requests per 10 seconds per token

**Documentation**: https://developer.atlassian.com/cloud/trello/rest/api-group-actions/

**Implementation Notes**:
- Simple REST API
- Limited webhook support
- Good for smaller teams

#### 4. Asana
**API Version**: REST API v1
**Authentication**: 
- Personal Access Token
- OAuth 2.0

**Key Endpoints**:
- `GET /tasks` - List tasks
- `GET /projects` - List projects
- `GET /tasks/{id}` - Get task details

**Rate Limits**:
- 1500 requests per minute per user

**Documentation**: https://developers.asana.com/docs/

**Implementation Notes**:
- Well-documented API
- Webhook support
- Premium features require paid plan

#### 5. Azure DevOps
**API Version**: REST API 7.1
**Authentication**: 
- Personal Access Token (PAT)
- OAuth 2.0

**Key Endpoints**:
- `GET /_apis/wit/workitems` - Get work items
- `GET /_apis/projects` - List projects
- `GET /_apis/wit/queries` - Run queries

**Rate Limits**:
- 200 requests per 5 seconds per organization

**Documentation**: https://docs.microsoft.com/en-us/rest/api/azure/devops/

**Implementation Notes**:
- Enterprise-focused
- Complex permission model
- Good for Microsoft ecosystems

### Comparison Matrix

| Feature | Jira | Monday | Trello | Asana | Azure DevOps |
|---------|------|--------|--------|-------|--------------|
| REST API | ✅ | ❌ | ✅ | ✅ | ✅ |
| GraphQL | ❌ | ✅ | ❌ | ❌ | ❌ |
| OAuth 2.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| API Token | ✅ | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rate Limit | 10/sec | 500/min | 300/10s | 1500/min | 200/5s |
| Complexity | High | Medium | Low | Medium | High |

## Encryption Research

### AES-256-GCM Implementation

**Why AES-256-GCM?**
- Authenticated encryption (confidentiality + integrity)
- NIST recommended
- Hardware acceleration support
- Industry standard for credential storage

**Implementation Details**:
```typescript
// Key generation
const key = crypto.randomBytes(32); // 256 bits

// Encryption
const iv = crypto.randomBytes(16); // 128-bit IV
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const authTag = cipher.getAuthTag();

// Storage format
const stored = {
  iv: iv.toString('base64'),
  encrypted: encrypted.toString('base64'),
  authTag: authTag.toString('base64'),
  version: '1'
};
```

**Key Management Options**:

1. **Environment Variables** (Chosen for v1)
   - Simple implementation
   - No external dependencies
   - Requires manual key rotation

2. **AWS KMS / Azure Key Vault** (Future)
   - Automatic key rotation
   - Hardware security modules
   - Audit logging
   - Additional cost and complexity

3. **HashiCorp Vault** (Future)
   - Dynamic secrets
   - Fine-grained access control
   - Requires infrastructure

### Security Best Practices

1. **Never store keys in database**
2. **Use separate keys per environment**
3. **Implement key rotation procedure**
4. **Log all encryption/decryption operations**
5. **Use authenticated encryption (GCM, not CBC)**

## Sync Strategy Research

### Incremental vs Full Sync

#### Incremental Sync
**Mechanism**: Track last sync timestamp, fetch only changes since then

**Pros**:
- Faster (seconds vs minutes)
- Less API quota usage
- Lower server load

**Cons**:
- May miss deleted items
- Requires timestamp tracking
- Complex conflict resolution

**Implementation**:
```typescript
// Store last sync timestamp
const lastSync = connection.lastSyncAt;

// Query for changes since last sync
const changes = await externalApi.getUpdates({
  since: lastSync,
  limit: 1000
});
```

#### Full Sync
**Mechanism**: Fetch all data, replace local state

**Pros**:
- Complete data consistency
- Simple implementation
- Good for initial sync

**Cons**:
- Slower (minutes for large datasets)
- High API quota usage
- Temporary data inconsistency during sync

**Implementation**:
```typescript
// Fetch all items
const allItems = await externalApi.getAllItems({
  limit: 1000,
  offset: 0
});

// Process in batches
while (allItems.hasMore) {
  await processBatch(allItems.items);
}
```

### Conflict Resolution

**Strategy**: External system is source of truth

**Rules**:
1. If item exists in external system but not local → Create locally
2. If item exists in both → Update local to match external
3. If item exists locally but not external → Mark as deleted (soft delete)
4. Log all conflicts for review

## Health Monitoring Research

### Health Check Types

1. **Connection Test** (Lightweight)
   - Test API endpoint accessibility
   - Validate credentials
   - Measure response time
   - Frequency: Every 15 minutes

2. **Sync Test** (Medium)
   - Perform lightweight data fetch
   - Verify data parsing
   - Check for errors
   - Frequency: Every 1 hour

3. **Full Sync** (Heavy)
   - Complete data synchronization
   - Verify all data types
   - Performance monitoring
   - Frequency: Manual only

### Health Status Definitions

| Status | Criteria | Action |
|--------|----------|--------|
| Healthy | Response < 5s, no errors | None |
| Warning | Response 5-10s, or sync delayed > 1 hour | Alert |
| Error | Response > 10s, auth failure, or sync error | Alert + Retry |

### Retry Strategy

**Exponential Backoff**:
- Attempt 1: Immediate
- Attempt 2: Wait 1 minute
- Attempt 3: Wait 5 minutes
- Attempt 4: Wait 15 minutes
- Max attempts: 3, then manual intervention required

## Audit Logging Research

### Required Audit Events

Per SOC2 and security best practices:

1. **Credential View** - When credentials are decrypted and viewed
2. **Credential Edit** - When credentials are modified
3. **Credential Test** - When connection test is performed
4. **Credential Delete** - When connection is deleted
5. **Sync Trigger** - When manual sync is initiated
6. **Sync Complete** - When sync finishes (success or failure)

### Audit Log Retention

- **Minimum**: 90 days (SOC2 requirement)
- **Recommended**: 1 year
- **Storage**: Immutable, tamper-evident
- **Access**: Role-based (consultant sees own, manager sees team)

### Audit Log Schema

```typescript
interface AuditLogEntry {
  id: string;
  connectionId: string;
  userId: string;
  action: AuditAction;
  actionResult: 'success' | 'failure';
  ipAddress: string;           // For security forensics
  userAgent: string;          // For debugging
  details: {
    syncType?: 'incremental' | 'full';
    errorMessage?: string;
    previousScope?: string;
    newScope?: string;
  };
  createdAt: Date;           // Immutable timestamp
}
```

## UI/UX Research

### Dashboard Layout Patterns

**Single Pane of Glass** (Chosen):
- All information visible at once
- Minimal navigation required
- Quick scan for status
- Responsive grid layout

**Components**:
- Header: User info, date, quick actions
- Left sidebar: Navigation, customer list
- Main area: Projects, time tracker, earnings
- Right sidebar: Connection health, upcoming deadlines

### Time Tracking UX

**Timer Pattern** (Chosen):
- One-click start/stop
- Visual running indicator
- Persistent across page navigation
- Manual entry as fallback

**Alternative Considered**:
- Calendar-based entry (too complex for daily use)
- List-based entry (slower for quick logging)

### Connection Management UX

**Card-Based Layout** (Chosen):
- Visual status indicators
- Quick actions (sync, test, edit)
- Expandable for details
- Filterable by status

**Security UX**:
- Clear scope indicators (PERSONAL vs TEAM)
- Warning on credential view
- Audit log access from connection details

## Performance Research

### Database Query Optimization

**Indexes Required**:
- `externalconnections(customerid)` - Customer lookups
- `externalconnections(consultantid)` - Consultant dashboards
- `externalconnections(status)` - Status filtering
- `credentialauditlogs(connectionid)` - Audit queries
- `synchistory(connectionid, startedat)` - History queries

**Query Patterns**:
- Dashboard: Single query with joins
- Connection list: Paginated, filtered
- Audit log: Time-based, paginated
- Sync history: Connection-based, recent first

### Caching Strategy

**Dashboard Data**:
- Cache for 30 seconds
- Invalidate on time entry
- Background refresh

**Connection Status**:
- Real-time for health
- Cached metadata (5 minutes)
- Manual refresh available

**Customer List**:
- Cache for 5 minutes
- Invalidate on CRUD operations

## Compliance Research

### SOC2 Requirements

**CC6.1 - Logical Access Security**:
- Role-based access control ✅
- Credential encryption ✅
- Audit logging ✅

**CC6.2 - Access Removal**:
- Soft delete support ✅
- Immediate access revocation ✅

**CC7.1 - System Operations**:
- Health monitoring ✅
- Error alerting ✅

### GDPR Requirements

**Data Minimization**:
- Only store necessary credentials
- No personal data in external system cache

**Right to Erasure**:
- Soft delete connections
- Anonymize audit logs after retention period

**Data Security**:
- Encryption at rest ✅
- Encryption in transit ✅

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Credential breach | Low | Critical | AES-256-GCM, key rotation |
| External API change | Medium | High | API versioning, error handling |
| Sync failure | Medium | Medium | Retry logic, manual fallback |
| Performance degradation | Low | Medium | Caching, pagination |
| Data inconsistency | Medium | Medium | Conflict resolution, audit logs |

## Recommendations

### Phase 1 (MVP)
- Support Jira and Monday (most popular)
- Environment variable key management
- Incremental sync only
- Basic health monitoring

### Phase 2 (Enhancement)
- Add Trello and Asana
- KMS integration option
- Full sync capability
- Advanced health monitoring

### Phase 3 (Future)
- Azure DevOps support
- Automatic key rotation
- Webhook-based real-time sync
- AI-powered conflict resolution

## References

1. [Atlassian Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
2. [Monday.com GraphQL API](https://developer.monday.com/api-reference/)
3. [Trello REST API](https://developer.atlassian.com/cloud/trello/rest/)
4. [Asana REST API](https://developers.asana.com/docs/)
5. [Azure DevOps REST API](https://docs.microsoft.com/en-us/rest/api/azure/devops/)
6. [NIST AES Guidelines](https://csrc.nist.gov/publications/detail/sp/800-38a/final)
7. [SOC2 Trust Services Criteria](https://www.aicpa.org/content/dam/aicpa/interestareas/frc/assurance/attest/clarified-sas/2017-trust-services-criteria.pdf)
