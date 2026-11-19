# wxKanban v1.7.91 converter compatibility

Result: all282 approved native target mappings are unsupported by the installed target configuration. Source recognition works; native target rendering is a separate missing capability. No mappings have been applied.

## Verified interface and code paths

- TYPEMAP[postgres] in pcsoft-schema-to-sql.py:44-52 contains scalar renderings, not native arrays/json/uuid.
- operator_mapping():456 accepts an exact source label or family and looks up an existing internal key.
- register_type_overrides():475 builds its valid key set from TYPEMAP; key validation at492 rejects arbitrary PostgreSQL expressions or new keys.
- parse_table():778-792 retains the source descriptor but stores the selected target key. Selecting int4/time/numeric for an array does not add an array container.
- col_type():1364 returns the fixed mapped type and substitutes scalar width at1380. It provides no native structured target or per-field p,s interface.
- Repeatable --type-map LABEL=KEY is supported; no external mapping-file or arbitrary target-DDL expression flag exists. field-type-mapping.json is a specification, not an executable configuration.

## Supported versus unsupported

Supported source recognition: all276 arrays, four JSON and two UUID. Supported without converter modification for these approved native targets: zero. Existing scalar integer/bigint, Boolean, character, numeric, date and time keys do not imply support for their array forms. Native json, jsonb and uuid keys/rendering are absent.

| Approved target | Fields | Current configuration |
|---|---:|---|
| bigint[] | 10 | Unsupported native target |
| boolean[] | 8 | Unsupported native target |
| date[] | 2 | Unsupported native target |
| integer[] | 40 | Unsupported native target |
| json | 4 | Unsupported native target |
| numeric[] | 80 | Unsupported native target |
| time[] | 80 | Unsupported native target |
| uuid | 2 | Unsupported native target |
| varchar(10)[] | 2 | Unsupported native target |
| varchar(100)[] | 2 | Unsupported native target |
| varchar(15)[] | 8 | Unsupported native target |
| varchar(20)[] | 12 | Unsupported native target |
| varchar(200)[] | 2 | Unsupported native target |
| varchar(256)[] | 2 | Unsupported native target |
| varchar(30)[] | 8 | Unsupported native target |
| varchar(50)[] | 20 | Unsupported native target |

Array=text / JSON=text / UUID=text can be accepted mechanically as scalar storage, but are incompatible with the approved native direction and do not establish serialization/validation semantics. No text, binary, scalar or JSONB workaround is approved.

## Minimum official capability

1. Native PostgreSQL typed-array rendering from the retained element descriptor, including each field width, signedness, source format and declared count.
2. Native json and uuid target keys/rendering, selected explicitly. Do not substitute jsonb.
3. Field-specific parameters/validation metadata for source-backed bounds, unsigned ranges, null/default rules and precision, while retaining explicit unresolved attributes. Declaring an array size in its SQL type alone is insufficient.
4. Exact unconstrained numeric[] unless owner-approved source evidence justifies a limit; no leakage of current scalar NUMERIC(18,4)/NUMERIC(24,6) defaults.
5. Preserve names/provenance/relationships/index evidence and refuse unresolved source semantics where implementation would lose information.
6. Official regression coverage for each family, count/dimension/width preservation, defaults, NULL/empty distinctions, native UUID/JSON and safe schema emission. No SQL-generation tests are executed by this specification task.

## Separate source-evidence gaps

Absent native type keys/rendering is a genuine converter capability limitation, not missing user configuration. Source lower bounds, nullability, validation precision/scale, sentinel/default and consumer contracts are separate metadata gaps. The282 type choices are final; all282 have some source metadata still unestablished. Native type selection does not approve null/default coercion or new business behaviour.

## Owner-approved next action

Review TYPE-MAPPING-SPECIFICATION.md and field-type-mapping.json. With explicit approval, provide the specification to the maintainer under existing feedback2634b849-ee80-4f37-b092-b5c773502e65 and request an official supported native-target implementation. Do not patch the local converter, fabricate a new configuration interface, upgrade the kit or use a custom conversion framework. No contact/feedback submission, dependency change or implementation occurred here.
