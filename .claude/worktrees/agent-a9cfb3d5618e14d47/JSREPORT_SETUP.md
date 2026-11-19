# jsreport Setup and Integration Guide

## Overview
jsreport has been successfully installed and integrated into the wxKanban project for generating PDF reports. This document provides an overview of the setup and usage instructions.

## What Was Installed

### Dependencies
- `jsreport` - Core reporting engine
- `@jsreport/jsreport-express` - Express integration
- `@jsreport/jsreport-chrome-pdf` - Chrome PDF generation engine
- `@jsreport/jsreport-handlebars` - Handlebars templating engine

### Files Created

1. **Configuration**
   - `jsreport.config.json` - jsreport server configuration
   - `jsreport-data/templates/` - Template storage directory
   - `jsreport-data/data/` - Data storage directory

2. **Service Layer**
   - `src/server/services/JsReportService.ts` - Main service wrapper for jsreport
   - `src/types/jsreport.d.ts` - TypeScript type definitions

3. **API Routes**
   - `src/server/routes/jsreport.ts` - Express routes for PDF generation

4. **Templates**
   - `jsreport-data/templates/audit-report.html` - Professional audit report template

## API Endpoints

### 1. Check jsreport Status
```
GET /api/reports/jsreport/status
```
Returns the initialization status of jsreport service.

### 2. Initialize jsreport
```
POST /api/reports/jsreport/initialize
```
Initializes the jsreport service (called automatically on first use).

### 3. Generate Audit Report PDF
```
POST /api/reports/jsreport/audit/:executionId
```
Generates a PDF audit report for a specific execution ID.

### 4. Generate Generic PDF
```
POST /api/reports/jsreport/generate
Body: { html: string, options?: object }
```
Generates a PDF from custom HTML content.

## Usage Examples

### Generate Audit Report
```bash
curl -X POST http://localhost:3000/api/reports/jsreport/audit/exec-123 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### Generate Custom PDF
```bash
curl -X POST http://localhost:3000/api/reports/jsreport/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<h1>My Report</h1><p>Content here</p>",
    "options": {
      "headerTemplate": "<div>Header</div>",
      "footerTemplate": "<div>Page <span class=\"pageNumber\"></span></div>"
    }
  }'
```

## Service Methods

The `JsReportService` provides the following methods:

```typescript
// Initialize jsreport
await jsReportService.initialize();

// Check if initialized
const isReady = jsReportService.isInitialized();

// Generate PDF from HTML
const pdfBuffer = await jsReportService.generatePdfFromHtml(htmlContent, options);

// Generate PDF from Handlebars template
const pdfBuffer = await jsReportService.generatePdfFromTemplate(templateName, data, options);

// Render template to HTML (no PDF)
const html = await jsReportService.renderTemplate(templateName, data);

// Create/update template
await jsReportService.createTemplate(name, content, helpers);

// List all templates
const templates = await jsReportService.listTemplates();

// Close jsreport
await jsReportService.close();
```

## Template System

### Audit Report Template
The audit report template (`audit-report.html`) includes:
- Professional header with gradient design
- Executive summary section
- Compliance score display
- Metrics grid (total tasks, passed, failed, needs review)
- Findings summary table (critical, high, medium, low)
- Detailed results with severity indicators
- Remediation recommendations
- Audit trail information
- Professional footer

### Creating Custom Templates

Templates use Handlebars syntax:
```html
<div class="report">
  <h1>{{title}}</h1>
  <p>Generated: {{generatedAt}}</p>
  {{#each items}}
    <div>{{name}}: {{value}}</div>
  {{/each}}
</div>
```

## Build Configuration

The server build script has been updated to externalize jsreport packages:
```json
"build:server": "esbuild src/server/index.ts --bundle --platform=node --outfile=dist/server.cjs --external:jsreport --external:@jsreport/jsreport-core --external:@jsreport/jsreport-chrome-pdf --external:@jsreport/jsreport-handlebars --external:@jsreport/jsreport-express"
```

This prevents bundling issues with jsreport's native dependencies.

## Next Steps

1. **Test the Integration**
   - Start the development server
   - Call the status endpoint to verify jsreport is accessible
   - Generate a test audit report

2. **Create Additional Templates**
   - Project status reports
   - Compliance reports
   - Custom business reports

3. **Integrate with Existing ReportService**
   - Modify `src/server/services/ReportService.ts` to use jsreport for PDF generation
   - Add PDF download option to existing report endpoints

4. **Environment Variables (Optional)**
   - Add `JSREPORT_PORT` for custom jsreport port
   - Add `JSREPORT_DATA_DIRECTORY` for custom data location

## Troubleshooting

### Chrome/Puppeteer Issues
If you encounter Chrome-related errors, ensure Chrome is installed or install Puppeteer:
```bash
npm install puppeteer
```

### Port Conflicts
jsreport uses port 5488 by default. If this port is in use, modify `jsreport.config.json` or the service initialization.

### Memory Issues
For large reports, increase Node.js memory:
```bash
node --max-old-space-size=4096 dist/server.cjs
```

## Security Considerations

- All jsreport endpoints require authentication
- HTML content is sanitized before PDF generation
- Templates are stored in the filesystem with restricted access
- jsreport's built-in authentication is disabled (using application's auth)

## Support

For more information about jsreport:
- Official Documentation: https://jsreport.net/learn
- Handlebars Helpers: https://handlebarsjs.com/guide/builtin-helpers.html
- Chrome PDF Options: https://jsreport.net/learn/chrome-pdf
