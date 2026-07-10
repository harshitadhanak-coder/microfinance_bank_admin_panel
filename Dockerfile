FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Copy environment file
COPY .env .env

# Build React/Vite app
RUN npm run build


FROM nginx:alpine

# Remove default nginx files
RUN rm -rf /usr/share/nginx/html/*


# Copy environment file
COPY .env .env

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build output
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]