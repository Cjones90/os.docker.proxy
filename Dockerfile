FROM jestrr/mods:no-java

WORKDIR /home/app

ADD package.json /home/app/package.json
RUN npm install

ADD pub /home/app/pub

ADD src /home/app/src
RUN npm run release

ADD server /home/app/server
ADD docker-compose.yml /home/app/docker-compose.yml
