FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/server.js .
COPY backend/db.js .
COPY backend/middleware/ ./middleware/
COPY backend/routes/ ./routes/
COPY frontend/ ./public/
EXPOSE 4000
CMD ["node", "server.js"]
