FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5173 STUDIO_MODE=local
COPY --from=build /app/package*.json ./
COPY --from=build /app/packages ./packages
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/examples ./examples
USER node
EXPOSE 5173
CMD ["npm", "start"]
