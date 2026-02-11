FROM node:16

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000 # Make sure server.js listens on process.env.PORT or 3000

CMD [ "npm", "start" ]
