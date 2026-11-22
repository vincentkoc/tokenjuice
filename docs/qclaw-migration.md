# QClaw migration

QClaw's official site now directs users to its shutdown/refund area and a
WorkBuddy migration flow. tokenjuice does not provide a QClaw hook installer.
Do not install the CodeBuddy CLI adapter as a QClaw compatibility alias.

Use the [official QClaw migration page](https://qclaw.qq.com/migration) to:

1. Sign into QClaw.
2. Sign into WorkBuddy and authorize the connection.
3. Review the data selected for synchronization.
4. Return to QClaw and complete the migration in its client.

The page limits authorization-based migration to **personal WorkBuddy
accounts**. Follow the current page for eligibility and refund information;
tokenjuice does not perform account authorization or data migration.

Treat WorkBuddy desktop as its own host. Migrated data does not prove that a
CodeBuddy CLI hook, an OpenClaw extension or tokenjuice instructions will load
there. For manual terminal workflows, install tokenjuice in the environment
that runs the command and use `tokenjuice wrap -- <command>`, or
`tokenjuice wrap --raw -- <command>` when exact output is required.
