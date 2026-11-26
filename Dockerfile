FROM node:24-trixie-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx ng build

FROM node:24-trixie-slim
# Debian's gh is too old for `gh api --slurp`, which the sky read uses, so gh comes from GitHub's own repo.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git tmux bash \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node contract ./contract
COPY --chown=node:node server ./server
COPY --chown=node:node skills ./skills
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/uaw-entrypoint
COPY --from=build --chown=node:node /src/dist ./dist
RUN chmod +x /usr/local/bin/uaw-entrypoint \
  && mkdir -p /home/node/.claude-config /home/node/.config /repos \
  && chown node:node /home/node/.claude-config /home/node/.config /repos
ENV UAW_RUNTIME=container \
  CLAUDE_CONFIG_DIR=/home/node/.claude-config \
  CLAUDE_INSTALL_HOME=/home/node/.claude-config/install \
  PATH=/home/node/.local/bin:$PATH \
  npm_config_cache=/repos/.npm \
  PORT=4200
USER node
VOLUME ["/home/node/.claude-config", "/home/node/.config", "/repos"]
EXPOSE 4200
ENTRYPOINT ["uaw-entrypoint"]
