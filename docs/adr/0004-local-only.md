---
status: accepted
---

# The board runs only on your own machine

The board runs on your own machine: on a Mac with iTerm2, or in a Docker container on that machine. We removed the parts that let you use the board from a different place, because nobody used them. The board was always used at the machine it runs on. The tickets of the Spec from the map "Map: local only" ([#1](https://github.com/srodriguezcode/Matt-Pocock-Workflow-UI/issues/1)) do the removal.

The removed parts:

- **Cloud Sessions**: a Start that opened a Session in Claude Code on the web. Every Start now opens a Session on your machine, and the Start sheet has no Local/Cloud choice.
- **Remote Control**: `--remote-control` on container Sessions.
- **The Pi**: the board on a Raspberry Pi. The container image stays, for `arm64` and `amd64`. "The Pi" is now "the container".
- **The phone layout**: the Rail as a list, bottom sheets, pinch zoom.
- **`UAW_HOSTS`**: the board answers only `localhost` and `127.0.0.1`.
- **`PI_LOCAL_CAP`**: the container has no Session cap.

Add these parts back only when someone really uses the board away from their own machine. Start a new map for that work. Do not add them back as a small fix.

## Considered options

- Keep the code, but hide it behind a setting: code that nobody uses can still break, and it still needs tests.
- Remove only the Pi and the phone layout, and keep Cloud Sessions: nobody used Cloud Sessions either.
