FROM node:alpine3.15

EXPOSE 3000
RUN mkdir -p /opt/app/src
WORKDIR /opt/app/src

ADD package.json /opt/app/.
ADD package-lock.json /opt/app/.
RUN npm install

ADD .env /opt/app/.env
ADD ./src /opt/app/src
ADD ./public /opt/app/public
# ADD ./ssl /opt/app/ssl

CMD ["npm","run","dev"]