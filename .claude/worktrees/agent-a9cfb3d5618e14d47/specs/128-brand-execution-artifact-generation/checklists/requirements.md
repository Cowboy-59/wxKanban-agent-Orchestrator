# Requirements Checklist: Brand Execution and Artifact Generation

**Spec**: 128 · **Parent Scope**: SCOPE-129

| Requirement | Title | Covered by |
|-------------|-------|------------|
| FR-001 | Mode tokens never reach the document root | |
| FR-002 | One font request covers every face | |
| FR-003 | The resting mode is in the base stylesheet | |
| FR-004 | The mode is emitted server-side | |
| FR-005 | The existing bundle is extended, not duplicated | |
| FR-006 | Every declared mode survives to output | |
| FR-007 | Non-mechanical checks become a checklist | |

## Metrics

- [ ] SC-1: 0 mode tokens emitted to the document root, verified by inspecting generated output rather than by reading the renderer
- [ ] SC-2: 1 font request covers every declared face across every mode, rather than one request per mode
- [ ] SC-3: 100% of pages render fully styled in the resting mode with the mode layer disabled and with scripting disabled
- [ ] SC-4: 0 reskin repaints after first paint, with the resolved mode present in the initial response on 100% of loads
- [ ] SC-5: 100% of declared modes appear in the generated stylesheet, with 0 dropped between storage and output
- [ ] SC-6: 4 acceptance checks that require a browser are emitted as a human-test checklist rather than counted as automated
