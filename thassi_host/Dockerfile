FROM node:24-alpine

WORKDIR /app

# Install Python 3, Git, and OpenSSH client for n8n workflow execution & unit tests
RUN apk add --no-cache python3 git openssh-client

# Copy pre-bundled zero-dependency runtime and built-in apps
COPY dist/ /app/dist/
COPY run.sh /app/run.sh

RUN sed -i 's/\r$//' /app/run.sh && chmod a+x /app/run.sh

ENV NODE_ENV=production
ENV PORT=8099
ENV THASSI_DATA_DIR=/data

EXPOSE 8099

CMD ["node", "--no-warnings", "/app/dist/server.mjs"]
