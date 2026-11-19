# Autofix Tests Command

## Usage
Run autonomous test-fix pipeline.

## Arguments
- test_pattern: Glob pattern for test files
- max_iterations: Maximum fix attempts (default: 5)

## Example
```
autofix_tests({ test_pattern: "**/*.test.ts", max_iterations: 3 })
```
