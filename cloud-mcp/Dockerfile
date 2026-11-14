FROM node:24-bookworm-slim
ENV NODE_ENV=production REA_LOG_LEVEL=info MCP_HOST=127.0.0.1 MCP_PORT=8766
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && npm install -g rea-agents@latest && npm cache clean --force
WORKDIR /app
COPY package.json server.mjs ./
EXPOSE 10000
CMD ["npm","start"]
