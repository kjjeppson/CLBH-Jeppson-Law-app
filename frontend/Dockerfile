FROM node:20-alpine AS build

WORKDIR /app

ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

COPY frontend/package.json /app/package.json

RUN yarn install --frozen-lockfile || yarn install

COPY frontend/ /app/

RUN yarn build

FROM node:20-alpine

WORKDIR /app

RUN yarn global add serve

COPY --from=build /app/build /app/build

EXPOSE 3000

# Use PORT env var for Railway compatibility, default to 3000
CMD serve -s build -l ${PORT:-3000}

