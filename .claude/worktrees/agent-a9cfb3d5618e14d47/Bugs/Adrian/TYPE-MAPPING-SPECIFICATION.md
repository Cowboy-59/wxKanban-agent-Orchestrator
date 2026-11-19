# ShopMaster Phoenix ? Stage 3 PostgreSQL type mapping specification

Status: target types finalised; source-attribute completion and official converter implementation still required. No mappings implemented. This specification follows the owner-approved native PostgreSQL direction and the official wxKanban Stage 3 diagnostic loop. It is not an executable --type-map input file.

## Decision counts

| Measure | Count |
|---|---:|
| Unique fields with final native target types | 282 |
| Undecided target-type choices | 0 |
| Fields with additional source-attribute evidence needed | 282 |
| Affected tables | 40 |
| Arrays | 276 |
| JSON | 4 |
| UUID | 2 |
| Implementable with current converter configuration | 0 |

The finalised and additional-evidence counts overlap. The supplied definitions do not print column nullability for any of the282 fields. That missing attribute does not undo the approved type decision, but it prevents claiming exact source-constraint parity. Additional field-specific questions are recorded individually, not silently filled. The machine-readable fields array contains exactly282 unique source fields, not282 diagnostic occurrences with duplicates.

## Approved target breakdown

| Target PostgreSQL type | Fields |
|---|---:|
| bigint[] | 10 |
| boolean[] | 8 |
| date[] | 2 |
| integer[] | 40 |
| json | 4 |
| numeric[] | 80 |
| time[] | 80 |
| uuid | 2 |
| varchar(10)[] | 2 |
| varchar(100)[] | 2 |
| varchar(15)[] | 8 |
| varchar(20)[] | 12 |
| varchar(200)[] | 2 |
| varchar(256)[] | 2 |
| varchar(30)[] | 8 |
| varchar(50)[] | 20 |

## Evidence and identity

Each JSON field record contains the source table and existing canonical/printed identifiers, original HFSQL label and wrapped declaration, element descriptor, N, string width, target type, constraints, defaults/nulls, precision, source Markdown lines/PDF pages/hash, decision status and exact missing evidence. Source IDs reconcile one-to-one with the official282-field classification. The46 existing naming corrections are unchanged; this task performs no naming investigation or conversion rerun. Raw defaults and declarations are source metadata, not salon records.

## Fixed-size array contract

For every non-NULL array, preserve exactly one dimension and the printed element count N. Preserve order and all element positions. Database-level validation is preferred and equivalent application/import validation is mandatory. Array type declarations alone do not enforce dimension count or size. [PostgreSQL arrays](https://www.postgresql.org/docs/current/arrays.html)

The supplied declarations establish count, not origin. Preserve the actual source lower bound and the upper bound origin+N-1; neither 0 nor1 is guessed. Obtain authoritative subscript metadata/usage before adding a lower-bound restriction or translating indices. Record source origin explicitly in the eventual import contract.

SQL NULL arrays, non-NULL empty arrays and arrays containing NULL elements are distinct. A non-NULL empty array cannot meet a positive fixed N; do not replace it by NULL or fill it with zeros/defaults. Retain/report incompatible source representations until their rule is confirmed. NULL slots must not be deleted, compacted or replaced by zero/false/empty strings. Column and element NULL permissions remain unresolved where absent from the extraction.

Signed 4-byte and8-byte values retain integer[] and bigint[] ranges. Unsigned2-byte elements use integer[] with explicit per-element 0..65535 validation; unsigned4-byte elements use bigint[] with 0..4294967295 validation. Widening storage alone does not preserve the unsigned domain. Boolean values remain Boolean.

## Defaults

30 complete printed element-default vectors were found. Each field records the raw ordered values, their source lines and proposed typed values. Boolean0/1 annotations map to false/true; numeric defaults remain exact decimal strings in the specification. No defaults have been implemented. No absent vector is inferred as zeros, false, empty strings or an empty array. Default origin/index alignment still needs the source array-bound contract.

Defaults are field-specific. Do not copy defaults or NULL policies between local and Server_ tables merely because names match; printed evidence differs between some counterparts. Clipped UUID annotations are retained as incomplete evidence, not expanded into complete defaults.

## Financial precision and scale

All80 Currency/Decimal array fields use unconstrained numeric[]. Do not impose p,s or substitute floating-point/PostgreSQL money storage. Preserve exact values through parsing, arithmetic, parameter binding, replication and reconciliation; avoid any IEEE floating-point intermediate. No undocumented rounding, display formatting or scale coercion is authorised. Unconstrained numeric does not force an invented scale. [PostgreSQL numeric](https://www.postgresql.org/docs/current/datatype-numeric.html)

The supplied bare Currency/Decimal declarations contain no explicit numeric precision/scale attributes. All80 source digit/scale/rounding limits are therefore unknown in this evidence set. This is a genuine gap for reproducing HFSQL validation/rounding behaviour, not a reason to narrow the approved exact storage. Obtain authoritative field/type attributes before implementing such limits. The kit scalar assumptions NUMERIC(18,4) and NUMERIC(24,6) are not adopted for these arrays.

## Strings

Use varchar(n)[] with each recorded source width. All56 widths are present; no255 fallback is used. Preserve text and trailing spaces. Validate character length before binding and reject overlength values, including excess trailing spaces; do not use a truncating explicit cast. Source encoding, original byte-versus-character limits and collation require confirmation. PostgreSQL varchar(n) counts characters. [Character types](https://www.postgresql.org/docs/current/datatype-character.html)

## Dates and times

Use date[] for date arrays and time[] without time zone for time arrays. Do not impose a fractional typmod from a display mask. Preserve hhmm/hhmmsscc evidence and every meaningful source digit; no timezone conversion or rounding is authorised. No actual empty/zero/sentinel value or conversion rule was established here, so no sentinel-to-NULL rule is invented. Values that cannot be represented require explicit review before import, rather than silent repair. [Date/time types](https://www.postgresql.org/docs/current/datatype-datetime.html)

## JSON and UUID

Use native json, not jsonb or scalar text. Preserve supplied JSON input text where supported, including whitespace, key order, duplicate keys and numeric lexemes. Do not parse/stringify merely to normalise it. Exact original HFSQL byte preservation cannot be promised until the future HExportJSON representation is verified. Preserve SQL NULL, JSON null, empty object/array and JSON empty string distinctions. Invalid/unquoted empty payloads need a source rule. [JSON types](https://www.postgresql.org/docs/current/datatype-json.html)

Use native uuid and preserve every original128-bit identity, including nil UUIDs if present. Do not generate, renumber or merge identifiers. PostgreSQL standardises textual output; consumer-specific formatting and replication comparisons require source-backed confirmation. The two clipped default annotations must not be completed by guesswork or replaced with a UUID generator. [UUID type](https://www.postgresql.org/docs/current/datatype-uuid.html)

## Offline, workstation and replication compatibility

Enforce the same approved value/shape contracts in the local salon service and central/replication boundaries without requiring an HQ connection to validate ordinary local data. This specification does not change replication ownership, SiteID isolation, record identifiers, existing indexes/relationships, offline/LAN requirements, transactions, application behaviour or deployment configuration. No array is flattened or split into new child tables. Do not introduce new indexes without caller/query evidence.

## Missing evidence by field count

| Question | Fields (overlapping) |
|---|---:|
| SOURCE_ARRAY_ELEMENT_NULLABILITY | 276 |
| SOURCE_ARRAY_LOWER_BOUND | 276 |
| SOURCE_COLUMN_NULLABILITY | 282 |
| SOURCE_DEFAULT_PROPERTY | 250 |
| SOURCE_JSON_EXPORT_EMPTY_CONTRACT | 4 |
| SOURCE_NUMERIC_PRECISION_SCALE_ROUNDING | 80 |
| SOURCE_STRING_ENCODING_LENGTH_COLLATION | 56 |
| SOURCE_TEMPORAL_EMPTY_SENTINEL | 82 |
| SOURCE_TIME_STORAGE_PRECISION | 80 |
| SOURCE_UUID_DEFAULT | 2 |
| SOURCE_UUID_LEXICAL_CONSUMERS | 2 |

These request existing analysis metadata and source contracts, not new business rules. No database/customer records were inspected. Native target choices remain final; constraint/default/import acceptance remains partial until the relevant attributes are established.

## Complete field-level mapping index

N and width come from each declaration. Detailed evidence, validation requirements and pending questions for each row are in field-type-mapping.json.

| Source table | Existing field identity | HFSQL declaration | N | Width | PostgreSQL target | Status |
|---|---|---|---:|---:|---|---|
| AutoMessage | AutoFeedbackActive | Array of 7 4-byte integer | 7 | ? | integer[] | Type final; attributes pending; converter unsupported |
| AutoMessage | AutoFeedbackDay | Array of 7 Boolean | 7 | ? | boolean[] | Type final; attributes pending; converter unsupported |
| AutoMessage | AutoFeedbackMessageI | Array of 7 8-byte integer | 7 | ? | bigint[] | Type final; attributes pending; converter unsupported |
| AutoMessage | AutoFeedbackProcessin | Array of 7 Boolean | 7 | ? | boolean[] | Type final; attributes pending; converter unsupported |
| AutoMessage | AutoFeedbackTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| AutoMessage | FridayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| AutoMessage | MondayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| AutoMessage | SaturdayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| AutoMessage | SundayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| AutoMessage | ThursdayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| AutoMessage | TuesdayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| AutoMessage | WednesdayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Books | EndTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Books | StartTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Cards | ItemCode | Array of 10 String | 10 | 20 | varchar(20)[] | Type final; attributes pending; converter unsupported |
| Cards | ItemDescription | Array of 10 String | 10 | 30 | varchar(30)[] | Type final; attributes pending; converter unsupported |
| Cards | ItemPrice | Array of 10 Currency | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Cards | ItemQty | Array of 10 Decimal | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Cards | ItemRedeemed | Array of 10 String | 10 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| Cards | Redeemdate | Array of 10 Date (yyyymmdd) | 10 | ? | date[] | Type final; attributes pending; converter unsupported |
| CardTypes | ItemCode | Array of 10 String | 10 | 15 | varchar(15)[] | Type final; attributes pending; converter unsupported |
| CardTypes | ItemName | Array of 10 String | 10 | 30 | varchar(30)[] | Type final; attributes pending; converter unsupported |
| CardTypes | ItemPrice | Array of 10 Currency | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| CardTypes | ItemQty | Array of 10 Decimal | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Control | BackUp1Times | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Control | BackUp2Times | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Control | CloseTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Control | FooterBoldFlags | Array of 10 Unsigned 2-byte integer | 10 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Control | FooterText | Array of 10 String | 10 | 256 | varchar(256)[] | Type final; attributes pending; converter unsupported |
| Control | OffPeakEnd | Array of 4 4-byte integer | 4 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Control | OffPeakStart | Array of 4 4-byte integer | 4 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Control | Opentime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Control | Subfolders | Array of 10 String | 10 | 200 | varchar(200)[] | Type final; attributes pending; converter unsupported |
| Float | BankCount | Array of 15 Unsigned 4-byte integer | 15 | ? | bigint[] | Type final; attributes pending; converter unsupported |
| Float | BankTakings | Array of 4 Currency | 4 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Float | CIDCount | Array of 15 Currency | 15 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Float | CountTakings | Array of 15 Currency | 15 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Float | PaymentCt | Array of 15 Unsigned 4-byte integer | 15 | ? | bigint[] | Type final; attributes pending; converter unsupported |
| Float | PaymentHeaders | Array of 15 String | 15 | 10 | varchar(10)[] | Type final; attributes pending; converter unsupported |
| Float | PaymentType | Array of 15 Currency | 15 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Float | RecordedTakings | Array of 15 Currency | 15 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Float | Remarks | Array of 15 String | 15 | 100 | varchar(100)[] | Type final; attributes pending; converter unsupported |
| Float | TDFCount | Array of 15 Unsigned 4-byte integer | 15 | ? | bigint[] | Type final; attributes pending; converter unsupported |
| Float | TMFCount | Array of 15 Unsigned 4-byte integer | 15 | ? | bigint[] | Type final; attributes pending; converter unsupported |
| Float | Variances | Array of 15 Currency | 15 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| ItemCost | ItemCode | Array of 10 String | 10 | 15 | varchar(15)[] | Type final; attributes pending; converter unsupported |
| LookUps | Flag | Array of 10 Boolean | 10 | ? | boolean[] | Type final; attributes pending; converter unsupported |
| LookUps | Integer | Array of 20 4-byte integer | 20 | ? | integer[] | Type final; attributes pending; converter unsupported |
| LookUps | Label | Array of 20 String | 20 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| LookUps | LKUPReal | Array of 20 Currency | 20 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| LookUps | LKUPString | Array of 20 String | 20 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| MasterPayLog | MasterPayLogID | UUID (128 bits) | ? | ? | uuid | Type final; attributes pending; converter unsupported |
| MasterPayLog | PaymentData | JSON | ? | ? | json | Type final; attributes pending; converter unsupported |
| MasterPayLog | PaymentDetails | JSON | ? | ? | json | Type final; attributes pending; converter unsupported |
| Resource | AvailFinished | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Resource | AvailStart | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Resource | Break1Finish | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Resource | Break1Start | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Resource | Break2Finish | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Resource | Break2Start | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Resource | FinishTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Resource | LunchFinish | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Resource | LunchStart | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Resource | StartTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_Appointments_COL_Amount | Array of 6 Currency | 6 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_Appointments_COL_Description | Array of 6 String | 6 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_Appointments_COL_Number | Array of 6 4-byte integer | 6 | ? | integer[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_Appointments_COL_Percent | Array of 6 4-byte integer | 6 | ? | integer[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_ClientAverages_COL_Amount | Array of 4 Currency | 4 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_ClientAverages_COL_Description | Array of 4 String | 4 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_ClientAverages_COL_Qty | Array of 4 4-byte integer | 4 | ? | integer[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_ClientServiceStats_COL_Amount | Array of 6 Currency | 6 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_ClientServiceStats_COL_Description | Array of 6 String | 6 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_ClientServiceStats_COL_Number | Array of 6 4-byte integer | 6 | ? | integer[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_ClientServiceStats_COL_Percent | Array of 6 4-byte integer | 6 | ? | integer[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_PaymentTypes_COL_Amount | Array of 20 Currency | 20 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_PaymentTypes_COL_Description | Array of 20 String | 20 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_PaymentTypes_COL_Number | Array of 20 4-byte integer | 20 | ? | integer[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_PaymentTypes_COL_Percent | Array of 20 4-byte integer | 20 | ? | integer[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_Points_COL_Descr | Array of 3 String | 3 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_Points_COL_Qty | Array of 3 4-byte integer | 3 | ? | integer[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_RetailDeptSales_COL_Amount | Array of 100 Currency | 100 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_RetailDeptSales_COL_Description | Array of 100 String | 100 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_RetailDeptSales_COL_Percent | Array of 100 4-byte integer | 100 | ? | integer[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_RetailDeptSales_COL_Qty | Array of 100 4-byte integer | 100 | ? | integer[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_ServiceDeptSales_COL_Amount | Array of 100 Currency | 100 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_ServiceDeptSales_COL_Percent | Array of 100 4-byte integer | 100 | ? | integer[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_ServiceDeptSales_COL_Qty | Array of 100 Decimal | 100 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_Takings_COL_Am | Array of 6 Currency | 6 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| SalesReport | TABLE_Takings_COL_Des | Array of 6 String | 6 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| Server_AutoMessage | AutoFeedbackActive | Array of 7 4-byte integer | 7 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_AutoMessage | AutoFeedbackDay | Array of 7 Boolean | 7 | ? | boolean[] | Type final; attributes pending; converter unsupported |
| Server_AutoMessage | AutoFeedbackMessageI | Array of 7 8-byte integer | 7 | ? | bigint[] | Type final; attributes pending; converter unsupported |
| Server_AutoMessage | AutoFeedbackProcessin | Array of 7 Boolean | 7 | ? | boolean[] | Type final; attributes pending; converter unsupported |
| Server_AutoMessage | AutoFeedbackTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_AutoMessage | FridayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_AutoMessage | MondayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_AutoMessage | SaturdayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_AutoMessage | SundayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_AutoMessage | ThursdayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_AutoMessage | TuesdayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_AutoMessage | WednesdayTime | Array of 3 Time (hhmmsscc) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Books | EndTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Books | StartTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Cards | ItemCode | Array of 10 String | 10 | 20 | varchar(20)[] | Type final; attributes pending; converter unsupported |
| Server_Cards | ItemDescription | Array of 10 String | 10 | 30 | varchar(30)[] | Type final; attributes pending; converter unsupported |
| Server_Cards | ItemPrice | Array of 10 Currency | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Cards | ItemQty | Array of 10 Decimal | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Cards | ItemRedeemed | Array of 10 String | 10 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| Server_Cards | Redeemdate | Array of 10 Date (yyyymmdd) | 10 | ? | date[] | Type final; attributes pending; converter unsupported |
| Server_CardTypes | ItemCode | Array of 10 String | 10 | 15 | varchar(15)[] | Type final; attributes pending; converter unsupported |
| Server_CardTypes | ItemName | Array of 10 String | 10 | 30 | varchar(30)[] | Type final; attributes pending; converter unsupported |
| Server_CardTypes | ItemPrice | Array of 10 Currency | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_CardTypes | ItemQty | Array of 10 Decimal | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Control | BackUp1Times | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Control | BackUp2Times | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Control | CloseTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Control | FooterBoldFlags | Array of 10 Unsigned 2-byte integer | 10 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_Control | FooterText | Array of 10 String | 10 | 256 | varchar(256)[] | Type final; attributes pending; converter unsupported |
| Server_Control | OffPeakEnd | Array of 4 4-byte integer | 4 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_Control | OffPeakStart | Array of 4 4-byte integer | 4 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_Control | Opentime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Control | Subfolders | Array of 10 String | 10 | 200 | varchar(200)[] | Type final; attributes pending; converter unsupported |
| Server_Float | BankCount | Array of 15 Unsigned 4-byte integer | 15 | ? | bigint[] | Type final; attributes pending; converter unsupported |
| Server_Float | BankTakings | Array of 4 Currency | 4 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Float | CIDCount | Array of 15 Currency | 15 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Float | CountTakings | Array of 15 Currency | 15 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Float | PaymentCt | Array of 15 Unsigned 4-byte integer | 15 | ? | bigint[] | Type final; attributes pending; converter unsupported |
| Server_Float | PaymentHeaders | Array of 15 String | 15 | 10 | varchar(10)[] | Type final; attributes pending; converter unsupported |
| Server_Float | PaymentType | Array of 15 Currency | 15 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Float | RecordedTakings | Array of 15 Currency | 15 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Float | Remarks | Array of 15 String | 15 | 100 | varchar(100)[] | Type final; attributes pending; converter unsupported |
| Server_Float | TDFCount | Array of 15 Unsigned 4-byte integer | 15 | ? | bigint[] | Type final; attributes pending; converter unsupported |
| Server_Float | TMFCount | Array of 15 Unsigned 4-byte integer | 15 | ? | bigint[] | Type final; attributes pending; converter unsupported |
| Server_Float | Variances | Array of 15 Currency | 15 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_ItemCost | ItemCode | Array of 10 String | 10 | 15 | varchar(15)[] | Type final; attributes pending; converter unsupported |
| Server_LookUps | Flag | Array of 10 Boolean | 10 | ? | boolean[] | Type final; attributes pending; converter unsupported |
| Server_LookUps | Integer | Array of 20 4-byte integer | 20 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_LookUps | Label | Array of 20 String | 20 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| Server_LookUps | LKUPReal | Array of 20 Currency | 20 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_LookUps | LKUPString | Array of 20 String | 20 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| Server_MasterPayLog | MasterPayLogID | UUID (128 bits) | ? | ? | uuid | Type final; attributes pending; converter unsupported |
| Server_MasterPayLog | PaymentData | JSON | ? | ? | json | Type final; attributes pending; converter unsupported |
| Server_MasterPayLog | PaymentDetails | JSON | ? | ? | json | Type final; attributes pending; converter unsupported |
| Server_Resource | AvailFinished | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Resource | AvailStart | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Resource | Break1Finish | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Resource | Break1Start | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Resource | Break2Finish | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Resource | Break2Start | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Resource | FinishTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Resource | LunchFinish | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Resource | LunchStart | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Resource | StartTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_Appointments_COL_Amount | Array of 6 Currency | 6 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_Appointments_COL_Description | Array of 6 String | 6 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_Appointments_COL_Number | Array of 6 4-byte integer | 6 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_Appointments_COL_Percent | Array of 6 4-byte integer | 6 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_ClientAverages_COL_Amount | Array of 4 Currency | 4 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_ClientAverages_COL_Description | Array of 4 String | 4 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_ClientAverages_COL_Qty | Array of 4 4-byte integer | 4 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_ClientServiceStats_COL_Amount | Array of 6 Currency | 6 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_ClientServiceStats_COL_Description | Array of 6 String | 6 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_ClientServiceStats_COL_Number | Array of 6 4-byte integer | 6 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_ClientServiceStats_COL_Percent | Array of 6 4-byte integer | 6 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_PaymentTypes_COL_Amount | Array of 20 Currency | 20 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_PaymentTypes_COL_Description | Array of 20 String | 20 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_PaymentTypes_COL_Number | Array of 20 4-byte integer | 20 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_PaymentTypes_COL_Percent | Array of 20 4-byte integer | 20 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_Points_COL_Descr | Array of 3 String | 3 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_Points_COL_Qty | Array of 3 4-byte integer | 3 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_RetailDeptSales_COL_Amount | Array of 100 Currency | 100 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_RetailDeptSales_COL_Description | Array of 100 String | 100 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_RetailDeptSales_COL_Percent | Array of 100 4-byte integer | 100 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_RetailDeptSales_COL_Qty | Array of 100 4-byte integer | 100 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_ServiceDeptSales_COL_Amount | Array of 100 Currency | 100 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_ServiceDeptSales_COL_Percent | Array of 100 4-byte integer | 100 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_ServiceDeptSales_COL_Qty | Array of 100 Decimal | 100 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_Takings_COL_Am | Array of 6 Currency | 6 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_SalesReport | TABLE_Takings_COL_Des | Array of 6 String | 6 | 50 | varchar(50)[] | Type final; attributes pending; converter unsupported |
| Server_Serving | SessionCardID | Array of 5 String | 5 | 20 | varchar(20)[] | Type final; attributes pending; converter unsupported |
| Server_Serving | Sessions | Array of 5 Decimal | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Serving | VoucherCode | Array of 5 String | 5 | 20 | varchar(20)[] | Type final; attributes pending; converter unsupported |
| Server_Serving | VoucherTotal | Array of 5 Currency | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Staff | AvailFinished | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Staff | AvailStart | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Staff | AvgTarget | Array of 7 Decimal | 7 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Staff | Break1Finish | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Staff | Break1Start | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Staff | Break2Finish | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Staff | Break2Start | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Staff | CustTarget | Array of 7 4-byte integer | 7 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_Staff | FinishTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Staff | LunchFinish | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Staff | LunchStart | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Staff | RetailTarget | Array of 7 Decimal | 7 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Staff | SalesTarget | Array of 7 Decimal | 7 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Staff | ServiceTarget | Array of 7 Decimal | 7 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Staff | StartTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Staff | WeeklyCustomers | Array of 7 4-byte integer | 7 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_Staff | WeeklyRetail | Array of 7 Decimal | 7 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Staff | WeeklySales | Array of 7 Decimal | 7 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Staff | WeeklyServices | Array of 7 4-byte integer | 7 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_Staff | WeeklySoldItems | Array of 7 4-byte integer | 7 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Server_Stafflog | EndBreak | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Stafflog | StartBreak | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Staflog | EndBreak | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Staflog | StartBreak | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_TaxTable | A1 | Array of 50 Decimal | 50 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_TaxTable | B2 | Array of 50 Decimal | 50 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_TaxTable | WagesFrom | Array of 50 Decimal | 50 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_TStaflog | EndBreak | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_TStaflog | StartBreak | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Server_Vouchers | SaleItemDes | Array of 10 String | 10 | 30 | varchar(30)[] | Type final; attributes pending; converter unsupported |
| Server_Vouchers | SaleItemPrice | Array of 10 Currency | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Vouchers | SaleItemRedeemed | Array of 10 Boolean | 10 | ? | boolean[] | Type final; attributes pending; converter unsupported |
| Server_Vouchers | SalesItemCode | Array of 10 String | 10 | 15 | varchar(15)[] | Type final; attributes pending; converter unsupported |
| Server_Vouchers | SalesItemQty | Array of 10 Decimal | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_VoucherTypes | ItemCode | Array of 10 String | 10 | 15 | varchar(15)[] | Type final; attributes pending; converter unsupported |
| Server_VoucherTypes | ItemName | Array of 10 String | 10 | 30 | varchar(30)[] | Type final; attributes pending; converter unsupported |
| Server_VoucherTypes | ItemPrice | Array of 10 Currency | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_VoucherTypes | ItemQty | Array of 10 Decimal | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Wages | Allowance | Array of 5 Currency | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Wages | AllowanceDes | Array of 5 String | 5 | 20 | varchar(20)[] | Type final; attributes pending; converter unsupported |
| Server_Wages | DeductDes | Array of 5 String | 5 | 20 | varchar(20)[] | Type final; attributes pending; converter unsupported |
| Server_Wages | Deduction | Array of 5 Currency | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Wages | Extra | Array of 5 Currency | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Wages | Hours | Array of 5 Decimal | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Wages | HoursDesc | Array of 5 String | 5 | 20 | varchar(20)[] | Type final; attributes pending; converter unsupported |
| Server_Wages | HoursMultiplier | Array of 5 Decimal | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Server_Wages | Pay | Array of 5 Currency | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Serving | SessionCardID | Array of 5 String | 5 | 20 | varchar(20)[] | Type final; attributes pending; converter unsupported |
| Serving | Sessions | Array of 5 Decimal | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Serving | VoucherCode | Array of 5 String | 5 | 20 | varchar(20)[] | Type final; attributes pending; converter unsupported |
| Serving | VoucherTotal | Array of 5 Currency | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Staff | AvailFinished | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Staff | AvailStart | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Staff | AvgTarget | Array of 7 Decimal | 7 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Staff | Break1Finish | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Staff | Break1Start | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Staff | Break2Finish | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Staff | Break2Start | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Staff | CustTarget | Array of 7 4-byte integer | 7 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Staff | FinishTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Staff | LunchFinish | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Staff | LunchStart | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Staff | RetailTarget | Array of 7 Decimal | 7 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Staff | SalesTarget | Array of 7 Decimal | 7 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Staff | ServiceTarget | Array of 7 Decimal | 7 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Staff | StartTime | Array of 7 Time (hhmm) | 7 | ? | time[] | Type final; attributes pending; converter unsupported |
| Staff | WeeklyCustomers | Array of 7 4-byte integer | 7 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Staff | WeeklyRetail | Array of 7 Decimal | 7 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Staff | WeeklySales | Array of 7 Decimal | 7 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Staff | WeeklyServices | Array of 7 4-byte integer | 7 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Staff | WeeklySoldItems | Array of 7 4-byte integer | 7 | ? | integer[] | Type final; attributes pending; converter unsupported |
| Stafflog | EndBreak | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Stafflog | StartBreak | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Staflog | EndBreak | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Staflog | StartBreak | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| TaxTable | A1 | Array of 50 Decimal | 50 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| TaxTable | B2 | Array of 50 Decimal | 50 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| TaxTable | WagesFrom | Array of 50 Decimal | 50 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| TStaflog | EndBreak | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| TStaflog | StartBreak | Array of 3 Time (hhmm) | 3 | ? | time[] | Type final; attributes pending; converter unsupported |
| Vouchers | SaleItemDes | Array of 10 String | 10 | 30 | varchar(30)[] | Type final; attributes pending; converter unsupported |
| Vouchers | SaleItemPrice | Array of 10 Currency | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Vouchers | SaleItemRedeemed | Array of 10 Boolean | 10 | ? | boolean[] | Type final; attributes pending; converter unsupported |
| Vouchers | SalesItemCode | Array of 10 String | 10 | 15 | varchar(15)[] | Type final; attributes pending; converter unsupported |
| Vouchers | SalesItemQty | Array of 10 Decimal | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| VoucherTypes | ItemCode | Array of 10 String | 10 | 15 | varchar(15)[] | Type final; attributes pending; converter unsupported |
| VoucherTypes | ItemName | Array of 10 String | 10 | 30 | varchar(30)[] | Type final; attributes pending; converter unsupported |
| VoucherTypes | ItemPrice | Array of 10 Currency | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| VoucherTypes | ItemQty | Array of 10 Decimal | 10 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Wages | Allowance | Array of 5 Currency | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Wages | AllowanceDes | Array of 5 String | 5 | 20 | varchar(20)[] | Type final; attributes pending; converter unsupported |
| Wages | DeductDes | Array of 5 String | 5 | 20 | varchar(20)[] | Type final; attributes pending; converter unsupported |
| Wages | Deduction | Array of 5 Currency | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Wages | Extra | Array of 5 Currency | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Wages | Hours | Array of 5 Decimal | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Wages | HoursDesc | Array of 5 String | 5 | 20 | varchar(20)[] | Type final; attributes pending; converter unsupported |
| Wages | HoursMultiplier | Array of 5 Decimal | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |
| Wages | Pay | Array of 5 Currency | 5 | ? | numeric[] | Type final; attributes pending; converter unsupported |

## Validation and next gate

The282 source identities match the official diagnostic classification exactly, with no omission or duplicate. All40 tables are represented; targets are valid native PostgreSQL type expressions. Every financial field is exact numeric and no array/JSON/UUID is scalar text. Field declarations, all string widths and all printed default-vector counts were verified at referenced source lines. Protected source/naming hashes remain unchanged. No converter rerun, SQL/ER generation, database access, dependency installation, initialization, task changes, staging, commit or push occurred.

Project-owner review precedes implementation. Request an official supported native target mechanism from the wxKanban maintainer; carry the unestablished source attributes as explicit validation/import gates. Do not modify the installed converter, original/corrected extraction or introduce a parallel converter.
