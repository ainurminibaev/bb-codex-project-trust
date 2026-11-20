**English** · [Русский](README.ru.md)

# Codex Project Trust for BB

Review and approve Codex project trust from the thread that reported it. The card shows the project path, the machine running Codex, and the user configuration file that will be changed. The final **Trust project** button saves the decision through Codex's own App Server.

## Install

```sh
bb plugin install 'git:https://github.com/ainurminibaev/bb-codex-project-trust.git@^1.0.0'
```

Requires BB 0.50.1 or newer and Codex CLI 0.170.0 or newer available to the BB host daemon. The enrolled machine must be connected. BB follows compatible Git tags when you run `bb plugin update codex-project-trust`.

## Use

1. Open a Codex thread with a project trust warning.
2. Select **Review trust** and check the details. Trust allows Codex to load project-local configuration, hooks, and command execution rules.
3. Select **Trust project**. Codex loads the updated configuration the next time the thread runtime starts. In BB, let active work finish before stopping and resuming a thread to pick up the change.

The plugin checks the Codex warning against the thread's current workspace and reads the matching user configuration on the enrolled machine. A missing project folder or changed workspace prevents a write. Profiles that resolve differently in the BB daemon require manual review of the file shown in the warning.

To revoke trust, remove the corresponding `trust_level = "trusted"` entry from the displayed Codex user configuration, then restart the runtime. Uninstalling this plugin does not revoke decisions stored by Codex.

## Development

```sh
npm ci --include=dev
npm run typecheck
npm test
bb plugin build .
```
