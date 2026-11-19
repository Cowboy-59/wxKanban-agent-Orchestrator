# Schema analysis — SCOPE-146 tables

Declared schema (`src/db/schema`); the live database may differ (db:drift is table-level only).
Whole-schema referential-integrity score: 7.2/10 (minor gaps). Tables: wxkanbandocuments, complianceaudittasks, auditexecutions, auditresults, auditreportmetadata, companyauditlogs, companyprojects.

| Dimension | Table | Location | Finding | Fix |
|---|---|---|---|---|
| fieldMapping | auditexecutions | src/db/schema/auditexecutions.ts:28 | missing updatedat timestamp |  |
| fieldMapping | auditreportmetadata | src/db/schema/auditreportmetadata.ts:29 | missing updatedat timestamp |  |
| fieldMapping | auditresults | src/db/schema/auditresults.ts:18 | missing updatedat timestamp |  |
| fieldMapping | companyauditlogs | src/db/schema/companyauditlog.ts:12 | missing createdat timestamp |  |
| fieldMapping | companyauditlogs | src/db/schema/companyauditlog.ts:12 | missing updatedat timestamp |  |
| fieldMapping | complianceaudittasks | src/db/schema/complianceaudittasks.ts:25 | missing updatedat timestamp |  |
| missingIndexes | auditexecutions | src/db/schema/auditexecutions.ts:32 | FK 'triggeredby' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_auditexecutions_triggeredby ON auditexecutions(triggeredby); |
| missingIndexes | auditexecutions | src/db/schema/auditexecutions.ts:38 | FK 'specid' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_auditexecutions_specid ON auditexecutions(specid); |
| missingIndexes | auditexecutions | src/db/schema/auditexecutions.ts:52 | frequent filter column 'status' has no index | CREATE INDEX idx_auditexecutions_status ON auditexecutions(status);  -- confirm query patterns first |
| missingIndexes | auditexecutions | src/db/schema/auditexecutions.ts:62 | FK 'reportdocumentid' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_auditexecutions_reportdocumentid ON auditexecutions(reportdocumentid); |
| missingIndexes | auditreportmetadata | src/db/schema/auditreportmetadata.ts:32 | FK 'documentid' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_auditreportmetadata_documentid ON auditreportmetadata(documentid); |
| missingIndexes | auditreportmetadata | src/db/schema/auditreportmetadata.ts:37 | FK 'executionid' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_auditreportmetadata_executionid ON auditreportmetadata(executionid); |
| missingIndexes | auditreportmetadata | src/db/schema/auditreportmetadata.ts:61 | FK 'reviewedby' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_auditreportmetadata_reviewedby ON auditreportmetadata(reviewedby); |
| missingIndexes | auditresults | src/db/schema/auditresults.ts:19 | FK 'executionid' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_auditresults_executionid ON auditresults(executionid); |
| missingIndexes | auditresults | src/db/schema/auditresults.ts:26 | FK 'taskid' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_auditresults_taskid ON auditresults(taskid); |
| missingIndexes | companyauditlogs | src/db/schema/companyauditlog.ts:13 | FK 'companyid' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_companyauditlogs_companyid ON companyauditlogs(companyid); |
| missingIndexes | companyauditlogs | src/db/schema/companyauditlog.ts:17 | FK 'changedby' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_companyauditlogs_changedby ON companyauditlogs(changedby); |
| missingIndexes | companyprojects | src/db/schema/companyproject.ts:17 | FK 'userid' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_companyprojects_userid ON companyprojects(userid); |
| missingIndexes | companyprojects | src/db/schema/companyproject.ts:20 | FK 'companyid' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_companyprojects_companyid ON companyprojects(companyid); |
| missingIndexes | companyprojects | src/db/schema/companyproject.ts:37 | FK 'customerid' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_companyprojects_customerid ON companyprojects(customerid); |
| missingIndexes | companyprojects | src/db/schema/companyproject.ts:46 | frequent filter column 'status' has no index | CREATE INDEX idx_companyprojects_status ON companyprojects(status);  -- confirm query patterns first |
| missingIndexes | complianceaudittasks | src/db/schema/complianceaudittasks.ts:26 | FK 'documentid' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_complianceaudittasks_documentid ON complianceaudittasks(documentid); |
| missingIndexes | wxkanbandocuments | src/db/schema/wxkanbandocuments.ts:58 | frequent filter column 'status' has no index | CREATE INDEX idx_wxkanbandocuments_status ON wxkanbandocuments(status);  -- confirm query patterns first |
| missingIndexes | wxkanbandocuments | src/db/schema/wxkanbandocuments.ts:62 | FK 'createdby' has no covering index (Postgres does not auto-index FKs) | CREATE INDEX idx_wxkanbandocuments_createdby ON wxkanbandocuments(createdby); |
