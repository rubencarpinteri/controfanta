# AI_WORKFLOW

One repo, multiple AIs (Claude, Codex, Qwen, Gemma). Each AI works in its **own Git worktree on its own branch**.

## Golden rule

**Never copy folders between AIs.** Move work only through Git: commit, then merge the other AI's branch.

## Branches

- `main` — stable version
- `claude/current` — Claude branch
- `codex/current` — Codex branch
- `qwen/current` — Qwen branch
- `gemma/current` — Gemma branch

## Worktrees (one folder per AI)

- `Controfanta`        → `main`
- `Controfanta-Claude` → `claude/current`
- `Controfanta-Codex`  → `codex/current`
- `Controfanta-Qwen`   → `qwen/current`
- `Controfanta-Gemma`  → `gemma/current`

## Handing off work

Each AI commits its own work first:

```
git add -A
git commit -m "wip"
```

Before switching **from Claude to Codex** (pull Claude's work into Codex):

```
cd Controfanta-Codex
git merge claude/current
```

Before switching **from Codex back to Claude**:

```
cd Controfanta-Claude
git merge codex/current
```

Same pattern for Qwen and Gemma — `git merge <other>/current` in the destination AI's folder.

## Promoting accepted work to stable

When a branch's work is accepted:

```
cd Controfanta
git checkout main
git merge claude/current
git push origin main
```

(Replace `claude/current` with whichever branch you are promoting.)
