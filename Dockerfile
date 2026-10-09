FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
ENV NODE_ENV=development
EXPOSE 8080
CMD ["npm","run","start:runtime"]
