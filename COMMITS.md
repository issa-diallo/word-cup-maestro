# Commit Message Guidelines

These rules are based on Chris Beams' "How to Write a Git Commit
Message": https://cbea.ms/git-commit/

## Seven Rules

1. Separate the subject from the body with a blank line.
2. Limit the subject line to about 50 characters.
3. Capitalize the subject line.
4. Do not end the subject line with a period.
5. Use the imperative mood in the subject line.
6. Wrap the body at about 72 characters.
7. Use the body to explain what and why, not how.

## Format

```text
Summarize the change in 50 characters or less

Explain the problem this commit solves and why this change is needed.
Keep lines around 72 characters. The code already shows how the change
was made, so focus the body on context, intent, tradeoffs, and side
effects that future readers should know.

Refs: #123
```

## Subject Line

- Write the subject as a command that completes:
  "If applied, this commit will ...".
- Prefer:
  - `Add match prediction form`
  - `Fix standings sort order`
  - `Remove unused API key helper`
- Avoid:
  - `Added match prediction form`
  - `Fixes standings sort order.`
  - `Some cleanup`

## Body

Use a body when the change needs context. A one-line commit is fine for
small, obvious changes.

Include:

- Why the change is needed.
- What behavior changes for users or maintainers.
- Important tradeoffs, side effects, migrations, or follow-up work.
- Issue or PR references at the bottom when relevant.

Avoid:

- Repeating the diff.
- Describing every implementation detail.
- Mixing unrelated changes in one commit.

## Agent Workflow

Before creating a commit in this project:

1. Review the staged diff.
2. Make sure the commit is atomic and focused.
3. Write the message using the rules above.
4. Mention any validation performed in the commit body when it adds useful
   context.
