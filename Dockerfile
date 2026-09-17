FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node public ./public
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_PATH=/app/data/campus.db
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
