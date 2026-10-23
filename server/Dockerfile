# Runs inside the workspace so @voting/shared (TS source) resolves at runtime.
FROM node:22-alpine
WORKDIR /app

# install only the workspaces the API needs
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
RUN npm install --no-audit --no-fund -w packages/shared -w server

COPY packages/shared ./packages/shared
COPY server ./server

WORKDIR /app/server
EXPOSE 4000
# @voting/shared ships TS source; tsx executes it directly (no cross-package emit)
CMD ["npx", "tsx", "src/index.ts"]
