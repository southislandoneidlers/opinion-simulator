# Test strategy (reconstructed summary)

Public seams only: the Python CLI commands are invoked as subprocesses against
golden fixtures (byte-exact tree comparisons), and desktop behavior is tested
through session functions whose artifacts are validated by the Python CLI.
Negative cases cover stale approvals, pending inferences, sample-count limits,
non-exact Source mappings, credential-shaped response keys, overwrite refusal,
tampering detection, schema violations, legacy compatibility, and dotfile
ignores. Live provider calls never run inside CI tests.
