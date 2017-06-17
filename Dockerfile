FROM jestrr/mods:no-java

WORKDIR /home/app

ADD package.json /home/app/package.json
RUN npm install

ADD src /home/app/src
RUN npm run release

ADD pub /home/app/pub
ADD server /home/app/server
