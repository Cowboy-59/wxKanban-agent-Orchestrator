# Quickstart: Consultant Dashboard (Spec 017)

## For Consultants

### Getting Started

1. **Access the Dashboard**
   - Log in to wxKanban with your TEAM role account
   - Click "Consultant Dashboard" in the main navigation
   - View your personalized dashboard with projects, time, and earnings

2. **Track Your Time**
   - Select a project from your dashboard
   - Click "Start Timer" to begin tracking
   - Or enter time manually with "Add Time Entry"
   - Your running timer persists across page refreshes

3. **Manage Customers**
   - Click "Customers" in the dashboard sidebar
   - Click "Add Customer" to create a new client
   - Fill in customer details (name, company, contact info)
   - View all your customers in the customer list

4. **Connect External Systems**
   - Select a customer from your list
   - Click "Add Connection" 
   - Choose system type (Jira, Monday, Trello, etc.)
   - Select credential scope:
     - **PERSONAL**: Only you can access these credentials
     - **TEAM**: Your Team Manager can also access
   - Enter API endpoint and credentials
   - Click "Test Connection" to verify
   - Save the connection

5. **Sync Data**
   - Go to a customer's connection list
   - Click "Sync" on any connection
   - Choose sync type:
     - **Incremental**: Sync only changes since last sync (faster)
     - **Full**: Sync all data (slower, more complete)
   - Monitor progress in the sync dialog
   - View results when complete

6. **View Earnings**
   - Check the EarningsWidget on your dashboard
   - Click on any time total to see detailed entries
   - Filter by date range (today, week, month, custom)
   - Export reports to PDF or CSV

7. **Monitor Connection Health**
   - View the HealthStatusWidget on your dashboard
   - Green = healthy, Yellow = warning, Red = error
   - Click for detailed health history
   - Receive email alerts on status changes

## For Team Managers

### Managing Team Connections

1. **View Team Connections**
   - Access "Team Connections" from admin panel
   - View all TEAM-scoped connections
   - See connection status and health

2. **Access TEAM Credentials**
   - Click on any TEAM connection
   - View credentials (you have access via TEAM scope)
   - Edit credentials if needed
   - All access is logged in audit trail

3. **Monitor Audit Logs**
   - Go to "Connection Audit" section
   - View audit logs for TEAM credentials
   - See who accessed credentials and when
   - Export logs for compliance

## For Developers

### CLI Commands

```bash
# Check consultant dashboard status
npx tsx cli/consultant-status.ts

# Check connection status
npx tsx cli/connection-status.ts --connection <id>

# Test a connection
npx tsx cli/test-connection.ts --connection <id>

# Trigger manual sync
npx tsx cli/sync-now.ts --connection <id> --type incremental

# View audit log
npx tsx cli/connection-audit.ts --connection <id> --last 24h

# Export all connections for a customer
npx tsx cli/export-connections.ts --customer <id>
```

### API Testing

```bash
# Get dashboard data
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/consultant/dashboard

# Create a connection
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jira Production",
    "systemType": "jira",
    "apiEndpoint": "https://jira.company.com/api",
    "credentials": {"apiToken": "xxx"},
    "credentialScope": "PERSONAL"
  }' \
  http://localhost:3000/api/consultant/customers/<id>/connections

# Trigger sync
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"syncType": "incremental"}' \
  http://localhost:3000/api/consultant/connections/<id>/sync
```

## Common Workflows

### Setting Up a New Customer

1. Add customer via CustomerPanel
2. Verify customer details
3. Add external system connection(s)
4. Test each connection
5. Perform initial full sync
6. Set up incremental sync schedule (manual)

### Daily Workflow

1. Check dashboard for today's priorities
2. Start timer on active project
3. Review connection health widget
4. Perform incremental syncs as needed
5. Add any new time entries
6. Review earnings summary

### Troubleshooting Connections

1. Check health status indicator
2. Click "Test Connection" to verify credentials
3. View sync history for errors
4. Check audit log for access issues
5. Update credentials if expired
6. Contact customer if API endpoint changed

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `?` | Open help panel |
| `t` | Start/stop timer |
| `n` | New time entry |
| `c` | Add customer |
| `s` | Search connections |

## Tips & Best Practices

### Time Tracking
- Start timer at beginning of work session
- Add descriptions to time entries for clarity
- Review daily totals before end of day
- Use manual entry for meetings and non-project work

### Customer Management
- Keep customer information up to date
- Use consistent naming conventions
- Add billing address for invoice generation
- Verify email addresses for notifications

### Connection Security
- Use PERSONAL scope for sensitive credentials
- Rotate credentials every 90 days
- Never share credentials outside the system
- Review audit logs regularly

### Sync Optimization
- Use incremental sync for daily updates
- Use full sync only when necessary
- Monitor sync performance
- Report slow connections to team

## Getting Help

- Click the help icon (?) on any page
- Use `/consultant-status` wxAI command
- Check connection health indicators
- Review audit logs for issues
- Contact team manager for TEAM credential access

## First-Time Setup Checklist

- [ ] Log in to wxKanban
- [ ] Navigate to Consultant Dashboard
- [ ] Review assigned projects
- [ ] Add your first customer
- [ ] Set up external system connection
- [ ] Test the connection
- [ ] Perform initial sync
- [ ] Start tracking time on a project
- [ ] Verify earnings calculation
- [ ] Bookmark dashboard for quick access
