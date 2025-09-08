FROM node:20-slim AS base

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN npm install -g npm@latest npm-run-all

# Install system packages
RUN apt update && \
  apt install -y \
  curl \
  git \
  vim \
  jq \
  netcat-openbsd \
  apt-transport-https \
  ca-certificates \
  gnupg \
  lsb-release \
  wget \
  gpg \
  xvfb \
  cmake \
  golang-go \
  default-jre \
  python3 \
  python3-venv \
  python3-dev \
  python3-pip \
  iputils-ping \
  iproute2 \
  net-tools \
  telnet \
  dnsutils \
  && rm -rf /var/lib/apt/lists/*

# Install VS Code
RUN wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg \
  && install -D -o root -g root -m 644 packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg \
  && echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" | tee /etc/apt/sources.list.d/vscode.list > /dev/null \
  && rm -f packages.microsoft.gpg \
  && apt update && apt install -y code \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install rust
ARG RUST_VERSION=1.87.0
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain ${RUST_VERSION} \
  && echo 'source $HOME/.cargo/env' >> $HOME/.bashrc

# Install VS Code extensions
ARG GOLANG_EXT_VERSION=0.46.1
ARG ESLINT_EXT_VERSION=3.0.10
ARG JAVA_EXT_VERSION=1.42.0
ARG PYTHON_EXT_VERSION=2025.6.1
ARG RUST_EXT_VERSION=0.3.2482
ARG TYPESCRIPT_EXT_VERSION=6.0.20250907


RUN mkdir -p /app/.vscode-template \
  && yes | code --no-sandbox --user-data-dir /app/.vscode-template --install-extension dbaeumer.vscode-eslint@${ESLINT_EXT_VERSION} \
  && yes | code --no-sandbox --user-data-dir /app/.vscode-template --install-extension ms-vscode.vscode-typescript-next@${TYPESCRIPT_EXT_VERSION} \
  && yes | code --no-sandbox --user-data-dir /app/.vscode-template --install-extension golang.go@${GOLANG_EXT_VERSION} \
  && yes | code --no-sandbox --user-data-dir /app/.vscode-template --install-extension redhat.java@${JAVA_EXT_VERSION} \
  && yes | code --no-sandbox --user-data-dir /app/.vscode-template --install-extension ms-python.python@${PYTHON_EXT_VERSION} \
  && yes | code --no-sandbox --user-data-dir /app/.vscode-template --install-extension rust-lang.rust-analyzer@${RUST_EXT_VERSION}

# Create workspace directory
RUN mkdir -p /workspace

# Copy and install container manager dependencies
COPY packages/agents-bridge-remote/package.json /app/container-manager/package.json
COPY packages/agents-bridge-remote/tsconfig.json /app/container-manager/tsconfig.json
WORKDIR /app/container-manager
RUN npm install

# Install tsx globally
RUN npm install -g tsx

# Copy container manager source
COPY packages/agents-bridge-remote/src/ /app/container-manager/src/

# Copy agents-bridge-extension files for building
COPY packages/agents-bridge-extension/package.json /tmp/agents-bridge-extension/package.json
COPY packages/agents-bridge-extension/tsconfig.json /tmp/agents-bridge-extension/tsconfig.json
COPY packages/agents-bridge-extension/esbuild.js /tmp/agents-bridge-extension/esbuild.js
COPY packages/agents-bridge-extension/extension.ts /tmp/agents-bridge-extension/extension.ts
COPY packages/agents-bridge-extension/commands.ts /tmp/agents-bridge-extension/commands.ts
COPY packages/agents-bridge-extension/core/ /tmp/agents-bridge-extension/core/
COPY packages/agents-bridge-extension/utils/ /tmp/agents-bridge-extension/utils/
COPY packages/agents-bridge-extension/types/ /tmp/agents-bridge-extension/types/

# Copy agents-bridge-shared dependency
COPY packages/agents-bridge-shared/ /tmp/agents-bridge-shared/

# Install dependencies and build agents-bridge-extension
WORKDIR /tmp/agents-bridge-shared
RUN npm install && npm run build

WORKDIR /tmp/agents-bridge-extension
RUN npm install ../agents-bridge-shared && npm run build

# Package agents-bridge-extension as VSIX
RUN npx @vscode/vsce package --no-dependencies --out agents-bridge-extension.vsix

# Install Roo Code extension (latest version)
RUN yes | code --no-sandbox --user-data-dir /app/.vscode-template --install-extension RooVeterinaryInc.roo-cline

# Install agents-bridge-extension
RUN yes | code --no-sandbox --user-data-dir /app/.vscode-template --install-extension /tmp/agents-bridge-extension/agents-bridge-extension.vsix

# Copy the pre-installed VS Code extensions to default location
RUN cp -r /app/.vscode-template /app/.vscode

# Configure VS Code settings for Docker environment
RUN mkdir -p /app/.vscode/User /app/.vscode-template/User

# Create settings.json with WebSocket configuration for Docker
RUN echo '{\
  "agent-bridge.wsUrl": "ws://host.docker.internal:8080",\
  "agent-bridge.wsPingInterval": 10000\
}' > /app/.vscode/User/settings.json

# Copy settings to template as well
RUN cp /app/.vscode/User/settings.json /app/.vscode-template/User/settings.json

# Copy entrypoint script
COPY packages/agents-bridge-remote/scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Set environment variables
ENV DONT_PROMPT_WSL_INSTALL=1
ENV WORKSPACE_PATH=/workspace

# Set working directory to container manager
WORKDIR /app/container-manager

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
