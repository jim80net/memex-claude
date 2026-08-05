FROM node:20-bookworm

# System deps for SWE-bench repos (Python, build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git curl jq \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Memex binary + ONNX runtime libraries
COPY dist/linux-x64/memex /usr/local/bin/memex
COPY dist/linux-x64/libonnxruntime*.so* /usr/local/lib/
RUN chmod 755 /usr/local/bin/memex && ldconfig

# Non-root eval user
RUN useradd -m -s /bin/bash eval

# Install hooks registration for Claude Code
# This makes Claude Code discover and invoke memex hooks.
# The hooks.json references the binary via command path.
COPY hooks/hooks.json /tmp/hooks-source.json
RUN mkdir -p /home/eval/.claude/hooks/memex-claude && \
    sed 's|${CLAUDE_PLUGIN_ROOT}/bin/memex|/usr/local/bin/memex|g' \
        /tmp/hooks-source.json > /home/eval/.claude/hooks/memex-claude/hooks.json && \
    rm /tmp/hooks-source.json

# Prepare dirs owned by eval
RUN mkdir -p /home/eval/.claude/cache /eval/scripts /eval/adapters /eval/snapshots /eval/raw /eval/workdir \
    && chown -R eval:eval /home/eval/.claude /eval

# Eval scripts and adapters (paths relative to project root build context)
COPY --chown=eval:eval eval/scripts/ /eval/scripts/
COPY --chown=eval:eval eval/adapters/ /eval/adapters/
RUN chmod +x /eval/scripts/*.sh /eval/adapters/*/*.sh

USER eval
WORKDIR /home/eval

# Snapshot git repo init
RUN cd /eval/snapshots && git init \
    && git config user.email "eval@memex" \
    && git config user.name "memex-eval"
