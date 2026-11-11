# Manual acceptance checklist

Automated tests prove the logic and what the mod draws. They cannot prove that Claude Code really accepts a prompt, or how the menu looks in your window. Run this once per Claude Code version and record the result.

Use a **copy** of your vault for the destructive steps: set the `vaultDir` option to a folder holding a copy of `prompts.md`, or accept that Add/Remove/Edit change the real file (a `prompts.md.bak` is written first).

Record: Claude Code version `______`  surface `VS Code / terminal / desktop`  date `______`

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | Start a new session. Look above the prompt box. | A **Prompt Vault** button. | |
| 2 | Type `/vault doctor`. | Mod version, Claude Code version, surface, vault path, prompt count, 0 problems. | |
| 3 | Click **Prompt Vault**. | The menu opens in a pane; clicking again closes it. | |
| 4 | **Browse prompts**. | One card per saved prompt (title, project, Run, Remove). | |
| 5 | Search a word from a title, press Enter. Click a filter. | The list narrows; filters change the list. | |
| 6 | Open a prompt. | Title, details, preview, character count. | |
| 7 | **Run** a short prompt (while idle). | "Sending…", then "accepted by Claude Code". Claude starts a turn whose first user message is exactly the saved text. | |
| 8 | Press **Run** while Claude is replying. | Run is not offered; "Claude Code is working…". Nothing is queued. | |
| 9 | Run a prompt containing a code fence, a tab and non-ASCII text. | The transcript shows it byte for byte. | |
| 10 | Run a prompt that is in a project (any project). | It runs with no extra question; the project never matters. | |
| 11 | **Put it in the prompt box**. | The text appears in the box, not sent. | |
| 12 | While a run is going, **Stop the turn**, confirm. | Claude stops; no error. | |
| 13 | **Mark done**, then **Mark pending**. | The checkbox flips; only that entry changes in `prompts.md`; the skill's `/prompt-vault list` agrees. | |
| 14 | **Add a prompt** with no project, Save. | Saved, unfiled; takes the lowest free ID. | |
| 15 | Add one with a title, a project and text containing a triple-backtick line. | Saved; opens with the exact text; `prompts.md` uses a four-backtick fence. | |
| 16 | **Edit** it, change the title, Save. | Only the title changes. | |
| 17 | **Remove** it: press Remove, then **Keep it**; again, **Yes, remove**. | Kept the first time; gone the second; others unchanged; `prompts.md.bak` holds the old file. | |
| 18 | **Help**, search `execute`. | Matching commands, shortcuts, FAQ. | |
| 19 | `/vault list pending`, `/vault search <word>`, `/vault run <id>`. | The pane shows the list; run is accepted. | |
| 20 | Use other Claude Code features (a tool call, `/help`, `/clear`). | Unaffected. | |
| 21 | **Projects** → **New project** `Test`; open it; **Add a prompt to Test**. | The project exists; the new prompt is in it; Back returns to Projects. | |
| 22 | **Rename** `Test` to `Test2`. | Its prompt shows `Test2`; the vault has no `Test` left. | |
| 23 | **Delete** `Test2`, confirm. | The project is gone; its prompt is still there, unfiled. | |
| 24 | Remove the prompt with the lowest ID, then add a new one. | The new prompt takes that lowest ID. | |
| 25 | Click **Prompt Vault**. | The small launcher above the prompt box disappears while the pane is open, and returns after **Close**. | |
| 26 | Open the vault in two different repos. | The same prompts appear in both (the vault is global). | |
| 27 | **Check for updates** (and `/vault update check`). | Says you are on the latest release, or names the newer one. With a newer release, **Install** runs and says to start a new session. | |

If a step fails, note what you saw and the output of `/vault doctor`; `claude --debug` logs every Run state change (prompt id, state, length, hash; never the prompt text).
