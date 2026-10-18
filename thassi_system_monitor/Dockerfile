FROM node:24-alpine

WORKDIR /app

COPY server.mjs /app/server.mjs
COPY run.sh /app/run.sh

RUN sed -i 's/\r$//' /app/run.sh && chmod a+x /app/run.sh

ENV NODE_ENV=production
ENV PORT=8099

EXPOSE 8099

CMD ["node", "--no-warnings", "/app/server.mjs"]
