# wxAI Pipeline Command

## Usage
Run the full spec pipeline: specify → clarify → plan → tasks.

## Arguments
- spec_number: Target spec number
- skip_clarify: Skip clarification phase (default: false)

## Example
```
// 1. Create spec from scope doc
wxk_spec_create({ spec_number: "011" })

// 2. Import tasks
wxk_scope_import({ spec_number: "011" })

// 3. Import documents
wxk_doc_import({ spec_number: "011" })
```
