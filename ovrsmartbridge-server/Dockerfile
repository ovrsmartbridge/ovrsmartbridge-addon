ARG BUILD_FROM
FROM ${BUILD_FROM}

COPY rootfs /

RUN apk update
RUN apk add nodejs=14.18.1-r0
RUN apk add npm=7.17.0-r0
RUN npm install

CMD [ "node", "index.js" ]