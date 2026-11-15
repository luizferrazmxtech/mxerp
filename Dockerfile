# MXERP: imagem única com o sistema (Next.js) e as ferramentas de linha de comando (migração, criar admin).
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && apt-get clean
ENV TZ=America/Sao_Paulo NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx prisma generate && npm run build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# aplica as migrações do banco e sobe o sistema
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 3000"]
