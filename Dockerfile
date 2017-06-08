FROM jestrr/mods:no-java

WORKDIR /home/app

ADD package.json /home/app/package.json

RUN npm install

ADD . /home/app

RUN npm run release
