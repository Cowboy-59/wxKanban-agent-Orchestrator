# Quickstart Guide: SysAdmin Platform Administration

**Spec:** 014 - SysAdmin Platform Administration  
**Date:** 2025-01-20

---

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ database
- Existing wxKanban development environment

### Environment Variables

Add to your `.env` file:

```bash
# SysAdmin Configuration
SYSADMIN_DEFAULT_EMAIL=sysadmin@wxkanban.com
SYSADMIN_DEFAULT_PASSWORD=change-me-in-production

# Optional: Feature flags during development
ENABLE_SYSADMIN_DASHBOARD=true
SYSADMIN_DEBUG_MODE=true
```

---

## Database Setup

### 1. Run Migration

```bash
# Apply the SysAdmin tables migration
npm run db:migrate

# Or apply specific migration
npx drizzle-kit migrate --config drizzle.config.ts
```

### 2. Verify Tables

Connect to your database and verify:

```sql
-- Check new tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('system_settings', 'company_status_history', 'company_analytics');

-- Check indexes
SELECT indexname, tablename 
FROM pg_indexes 
WHERE tablename IN ('system_settings', 'company_status_history', 'company_analytics');
```

### 3. Seed Default Settings

```bash
# Run seed script to populate default system settings
npm run db:seed:sysadmin
```

---

## Create First SysAdmin User

### Option 1: CLI Script (Recommended)

```bash
# Create SysAdmin user via CLI
npx ts-node scripts/create-sysadmin.ts \
  --email "sysadmin@wxkanban.com" \
  --password "SecurePassword123!" \
  --fullname "System Administrator"

# Output:
# ✅ SysAdmin user created successfully
# ID: 550e8400-e29b-41d4-a716-446655440000
# Email: sysadmin@wxkanban.com
# Security Level: 10
```

### Option 2: Database Insert

```sql
-- Create system company first (if using system company approach)
INSERT INTO companies (id, companyname, status, subscriptiontier)
VALUES ('00000000-0000-0000-0000-000000000000', 'System', 'active', 'enterprise');

-- Create SysAdmin user
INSERT INTO userprofiles (
  id, emailaddr, fullname, password, usertype, 
  companyid, securitylevel, active, joinedat
) VALUES (
  gen_random_uuid(),
  'sysadmin@wxkanban.com',
  'System Administrator',
  '$2b$10$...', -- bcrypt hashed password
  'SYSADMIN',
  '00000000-0000-0000-0000-000000000000',
  10,
  true,
  NOW()
);
```

---

## API Testing

### 1. Authenticate as SysAdmin

```bash
# Login endpoint
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sysadmin@wxkanban.com",
    "password": "SecurePassword123!"
  }'

# Response includes JWT token with usertype: "SYSADMIN"
```

### 2. Test Company Management

```bash
# List all companies
curl -X GET http://localhost:3000/api/sysadmin/companies \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"

# Create a new company
curl -X POST http://localhost:3000/api/sysadmin/companies \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "companyname": "Test Company",
    "primaryemail": "admin@testcompany.com",
    "subscriptiontier": "pro",
    "adminUser": {
      "fullname": "Admin User",
      "emailaddr": "admin@testcompany.com",
      "password": "TempPass123!"
    }
  }'
```

### 3. Test User Management

```bash
# Search users globally
curl -X GET "http://localhost:3000/api/sysadmin/users?q=john" \
  -H "Authorization: Bearer <token>"

# Reset user password
curl -X POST http://localhost:3000/api/sysadmin/users/<user-id>/reset-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "User forgot password",
    "notifyUser": true
  }'
```

### 4. Test Metrics

```bash
# Get platform metrics
curl -X GET http://localhost:3000/api/sysadmin/metrics/platform \
  -H "Authorization: Bearer <token>"

# Get database health
curl -X GET http://localhost:3000/api/sysadmin/metrics/database \
  -H "Authorization: Bearer <token>"
```

---

## Frontend Development

### 1. Start Development Server

```bash
# Start backend API
npm run dev:server

# Start frontend (in separate terminal)
npm run dev:client

# Or start both
npm run dev
```

### 2. Access SysAdmin Dashboard

Navigate to: `http://localhost:5173/sysadmin`

**Login with SysAdmin credentials** created earlier.

### 3. Key Frontend Routes

| Route | Description |
|-------|-------------|
| `/sysadmin` | Dashboard overview |
| `/sysadmin/companies` | Company management |
| `/sysadmin/companies/:id` | Company detail |
| `/sysadmin/users` | Global user search |
| `/sysadmin/users/:id` | User detail |
| `/sysadmin/metrics` | System monitoring |
| `/sysadmin/settings` | Global settings |

---

## Testing

### Run Unit Tests

```bash
# Test middleware
npm test -- src/server/middleware/requireSysAdmin.test.ts

# Test services
npm test -- src/server/services/SysAdminCompanyService.test.ts
npm test -- src/server/services/SysAdminUserService.test.ts
```

### Run Integration Tests

```bash
# Test API endpoints
npm run test:integration -- sysadmin

# Or specific test file
npm run test:integration -- src/tests/integration/sysadmin-api.test.ts
```

### Manual Testing Checklist

- [ ] SysAdmin can login and access dashboard
- [ ] Company list loads with pagination
- [ ] Can create new company with admin user
- [ ] Can update company status (suspend/activate)
- [ ] Global user search returns results from all companies
- [ ] Can reset user password
- [ ] Can disable/enable user accounts
- [ ] Platform metrics display correctly
- [ ] Database health metrics load
- [ ] All actions are audited in audit log

---

## Debugging

### Enable Debug Logging

```bash
# In .env
LOG_LEVEL=debug
SYSADMIN_DEBUG_MODE=true
```

### Common Issues

**Issue**: `403 Forbidden` on SysAdmin endpoints
- Verify user has `usertype: 'SYSADMIN'`
- Check `securitylevel` is 10
- Ensure JWT token includes correct usertype claim

**Issue**: Database queries are slow
- Check indexes are created: `idx_company_status_history_company`
- Verify `company_analytics` table has data
- Run `ANALYZE` on affected tables

**Issue**: Cannot create company
- Verify email is unique across all users
- Check company name is not duplicate
- Ensure subscription tier is valid enum value

---

## Production Deployment

### Pre-deployment Checklist

- [ ] Migration applied to production database
- [ ] Default system settings seeded
- [ ] At least one SysAdmin user created
- [ ] MFA enabled for SysAdmin accounts
- [ ] Audit logging configured
- [ ] Rate limiting tested
- [ ] Backup strategy verified

### Security Considerations

1. **Change default SysAdmin password immediately**
2. **Enable MFA for all SysAdmin accounts**
3. **Restrict SysAdmin access by IP if possible**
4. **Monitor audit logs for suspicious activity**
5. **Regular security reviews of SysAdmin actions**

### Rollback Plan

If issues occur:

```bash
# Revert migration
npx drizzle-kit migrate:down

# Or manually disable SysAdmin features
UPDATE system_settings 
SET settingvalue = 'false'::jsonb 
WHERE settingkey = 'features.sysadmin_enabled';
```

---

## Next Steps

1. **Complete Phase 1**: Verify all foundation components work
2. **Implement Phase 2**: Build company management UI
3. **Implement Phase 3**: Build user management UI
4. **Implement Phase 4**: Build metrics dashboard
5. **User Acceptance Testing**: Have stakeholders test workflows
6. **Deploy to Production**: Follow deployment checklist

---

## Support

- **Documentation**: See `docs/API.md` for full API reference
- **Troubleshooting**: Check `docs/TROUBLESHOOTING.md`
- **Team Chat**: #sysadmin-dev channel

---

*This quickstart was generated as part of the wxAI pipeline Phase 3: Plan*
